import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EXPERIMENT, LEAGUES, generateTrial, settleTrial } from "./lib/football-price-gap-trial.mjs";

// Reuse repository environment precedence without logging credentials.
export async function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const contents = await readFile(new URL(`../../../${name}`, import.meta.url), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
        if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

// Page stable source reads and use insert-ignore to preserve the first saved forecast.
export function createClient(url, key) {
  // Keep REST errors useful without printing request headers or secrets.
  async function request(table, search = {}, method = "GET", body, prefer = "return=minimal") {
    const target = new URL(`/rest/v1/${table}`, url);
    for (const [name, value] of Object.entries(search)) target.searchParams.set(name, value);
    const response = await fetch(target, { method, headers: { apikey: key, authorization: `Bearer ${key}`,
      "content-type": "application/json", prefer }, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  // Explicit id ordering prevents pagination from duplicating rows across pages.
  async function all(table, search = {}) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await request(table, { select: "*", order: "id.asc", ...search, limit: "1000", offset: String(offset) });
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  return { request, all };
}

// Refresh forecasts only for upcoming events and reconcile existing trial records separately.
export async function refreshTrial(client, { dryRun = false } = {}) {
  const snapshots = [];
  const results = [];
  for (const league of LEAGUES) {
    const source = await client.all(`${league}_market_snapshots`, {
      advertised_start_at: `gt.${new Date().toISOString()}`,
      select: "source_event_id,source_snapshot_key,snapshot_at,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price,draw_fixed_win_price",
    });
    const settled = await client.all(`${league}_fixed_win_snapshot_results`, {
      select: "source_event_id,source_snapshot_key,snapshot_at,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price,draw_fixed_win_price,home_team_won,away_team_won,match_drawn,outcome_status",
    });
    snapshots.push(...source.map((row) => ({ ...row, league })));
    const observedAt = new Date().toISOString();
    results.push(...settled.map((row) => ({ ...row, league, observed_at: observedAt })));
  }
  const now = new Date().toISOString();
  const rows = generateTrial(snapshots, results, now);
  const existing = await client.all("football_price_gap_predictions", { experiment: `eq.${EXPERIMENT}` });
  const keys = new Set(existing.map((r) => `${r.league}:${r.source_event_id}:${r.cohort}`));
  const fresh = rows.filter((r) => !keys.has(`${r.league}:${r.source_event_id}:${r.cohort}`));
  const resultMap = new Map();
  for (const result of results) {
    const key = `${result.league}:${result.source_event_id}`;
    if (!resultMap.has(key) || Date.parse(result.snapshot_at) > Date.parse(resultMap.get(key).snapshot_at)) resultMap.set(key, result);
  }
  let reconciled = 0;
  for (const row of existing) {
    const update = settleTrial(row, resultMap.get(`${row.league}:${row.source_event_id}`), now);
    if (!update || (update.outcome_status === row.outcome_status && update.won === row.won && (update.unit_return === null ? row.unit_return === null : update.unit_return === Number(row.unit_return)))) continue;
    // Rechecking every row lets official corrections remove or revise an earlier settlement.
    if (!dryRun) await client.request("football_price_gap_predictions", { id: `eq.${row.id}` }, "PATCH", update);
    reconciled += 1;
  }
  if (!dryRun) {
    for (let i = 0; i < fresh.length; i += 100) {
      // Recheck real time immediately before writing; the database also rejects late inserts.
      const batch = fresh.slice(i, i + 100).filter((row) => Date.parse(row.kickoff_at) > Date.now());
      if (batch.length) await client.request("football_price_gap_predictions", {
        on_conflict: "experiment,league,source_event_id,cohort",
      }, "POST", batch, "resolution=ignore-duplicates,return=minimal");
    }
  }
  return { dryRun, eligible: rows.length, newForecasts: fresh.length, reconciled, sourceResults: results.length,
    insufficientBucketHistory: fresh.filter((r) => r.bucket_probability === null).length,
    insufficientRichHistory: fresh.filter((r) => r.rich_probability === null).length };
}

// Manual and scheduled entrypoint; historical timestamp overrides are intentionally unsupported.
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--dry-run", "--require-supabase"].includes(arg))) throw new Error("Supported flags: --dry-run, --require-supabase");
  await loadEnv();
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.FEELING_GAMBA_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service key are required, including for a read-only dry run.");
  console.log(JSON.stringify(await refreshTrial(createClient(url, key), { dryRun: args.includes("--dry-run") }), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
