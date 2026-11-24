import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_LEAGUES } from '../../packages/ingestion/scripts/lib/market-workflows.mjs';

const TITLE = 'TAB market source unavailable';
const MARKER = '<!-- tab-market-source-incident-v1 -->';

// Require evidence from the current attempt; missing/expired artifacts cannot prove recovery.
export function marketRunStatus(run, artifacts) {
  if (!run) return 'unknown';
  const names = artifacts.filter((artifact) => !artifact.expired).map((artifact) => artifact.name);
  if (names.includes(`tab-market-source-unavailable-${run.run_attempt}`)) return 'source-unavailable';
  if (run.conclusion === 'success' && names.includes(`tab-market-healthy-${run.run_attempt}`)) return 'healthy';
  return 'unknown';
}

// Deduplicate outages globally and require every monitored workflow to demonstrate recovery.
export function incidentAction(states, existingIncident) {
  if (states.some((state) => state.status === 'source-unavailable')) return existingIncident ? 'unchanged' : 'open';
  if (existingIncident && states.length === MARKET_LEAGUES.length && states.every((state) => state.status === 'healthy')) return 'close';
  return 'unchanged';
}

// Use only GitHub's API origin; expose status codes rather than tokens or response bodies.
export function githubClient(repository, token, fetchImpl = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
  return async (route, method = 'GET', body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${route}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${route.split('?')[0]} returned HTTP ${response.status}`);
    return response.json();
  };
}

// Inspect scheduled default-branch runs only; manual dry runs cannot close a production incident.
export async function collectStates(api, branch) {
  return Promise.all(MARKET_LEAGUES.map(async (league) => {
    const runs = await api(`actions/workflows/${league}-market-refresh.yml/runs?event=schedule&branch=${encodeURIComponent(branch)}&status=completed&per_page=1`);
    const run = runs.workflow_runs[0];
    const artifacts = run ? await api(`actions/runs/${run.id}/artifacts?per_page=100`) : { artifacts: [] };
    return { league, status: marketRunStatus(run, artifacts.artifacts), url: run?.html_url ?? null };
  }));
}

// Find the durable incident without depending on search indexing or a repository label setup.
async function findIncident(api) {
  for (let page = 1; ; page += 1) {
    const issues = await api(`issues?state=open&per_page=100&page=${page}`);
    const incident = issues.find((issue) => !issue.pull_request && issue.title === TITLE && issue.body?.includes(MARKER));
    if (incident || issues.length < 100) return incident;
  }
}

// Include current evidence in the run summary and only notify on an incident transition.
export async function monitor(api, branch, summary = async () => {}) {
  const states = await collectStates(api, branch);
  const incident = await findIncident(api);
  const action = incidentAction(states, incident);
  const evidence = states.map(({ league, status, url }) => `- ${league}: ${status}${url ? ` ([run](${url}))` : ''}`).join('\n');
  let issueUrl = incident?.html_url;
  if (action === 'open') {
    const issue = await api('issues', 'POST', {
      title: TITLE,
      body: `${MARKER}\n\nTAB market capture is unavailable. This is not evidence of inactive competitions or an empty market list. Scheduled captures stop at the failed request; later pipeline steps do not run. Partial earlier writes may exist.\n\n${evidence}\n\nThis incident is shared across all market workflows. Repeated outages are recorded in run summaries without new comments or failure emails. The monitor closes this issue only after every workflow's latest scheduled run has healthy evidence. Subscribe to this issue for recovery notification.`,
    });
    issueUrl = issue.html_url;
  } else if (action === 'close') {
    await api(`issues/${incident.number}`, 'PATCH', {
      state: 'closed', state_reason: 'completed',
      body: `${incident.body}\n\n## Recovery\n\nAll latest scheduled market refreshes completed successfully. This confirms current retrieval, not backfill of prices missed during the outage.\n\n${evidence}`,
    });
  }
  await summary(`## TAB market source: ${action}\n\n${issueUrl ? `Incident: ${issueUrl}\n\n` : ''}${evidence}\n`);
  return { action, states, issueUrl };
}

// Fail once when a new incident opens; repeated outages remain recorded without repeat failure emails.
async function main() {
  const api = githubClient(process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN);
  const { default_branch: branch } = await api('');
  const result = await monitor(api, branch, async (text) => {
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  });
  if (result.action === 'open') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
