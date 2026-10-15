import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { trainingRows, buildForecasts, LEAGUES } from './lib/football-price-gap-trial.mjs';

const DAY = 86400000;
// Fixed hypotheses declared before inspecting outcomes; no threshold search or fitted ensemble weights.
export const CANDIDATES = [
  { key: 'all', label: 'All priced team favourites', select: () => true },
  { key: 'gap', label: 'Price gap $2+', select: r => r.m.gap >= 2 },
  { key: 'opponent', label: 'Opponent $3.50+', select: r => r.m.other >= 3.5 },
  { key: 'home', label: 'Opponent $3.50+ and home favourite', select: r => r.m.other >= 3.5 && r.m.homeFavourite },
  { key: 'short', label: 'Opponent $3.50+ and favourite <= $2', select: r => r.m.other >= 3.5 && r.m.favourite <= 2 },
  { key: 'low_draw', label: 'Opponent $3.50+ and implied draw <= 25%', select: r => r.m.other >= 3.5 && r.m.drawProbability <= 0.25 },
  { key: 'intersection', label: 'Opponent $3.50+ and price gap $2+', select: r => r.m.other >= 3.5 && r.m.gap >= 2 },
  { key: 'bucket65', label: 'Opponent $3.50+ and historical rate >= 65%', select: r => r.m.other >= 3.5 && r.bucket !== null && r.bucket >= 0.65 },
  { key: 'context65', label: 'Opponent $3.50+ and context probability >= 65%', select: r => r.m.other >= 3.5 && r.rich !== null && r.rich >= 0.65 },
  { key: 'consensus65', label: 'Opponent $3.50+ and historical/context both >= 65%', select: r => r.m.other >= 3.5 && r.bucket !== null && r.rich !== null && Math.min(r.bucket, r.rich) >= 0.65 },
  { key: 'blend65', label: 'Opponent $3.50+ and equal market/context blend >= 65%', select: r => r.m.other >= 3.5 && r.rich !== null && (r.m.probability + r.rich) / 2 >= 0.65 },
  { key: 'blend_edge', label: 'Opponent $3.50+ and blended expected return >= 1.05', select: r => r.m.other >= 3.5 && r.rich !== null && ((r.m.probability + r.rich) / 2) * r.m.favourite >= 1.05 },
];

// Group by NZ kickoff day so matches played together remain together in splits and resamples.
function matchDay(row) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.advertised_start_at));
}

// Every reconstructed prediction uses only captures/results eligible before its own price timestamp.
export function observations(results, fetchedAt) {
  const usable = trainingRows(results.map(r => ({ ...r, observed_at: fetchedAt })), fetchedAt);
  return usable.map(target => {
    const cutoff = Date.parse(target.snapshot_at);
    const earlier = usable.filter(r => Date.parse(r.advertised_start_at) + DAY <= cutoff
      && Date.parse(r.snapshot_at) <= cutoff
      && !(r.league === target.league && r.source_event_id === target.source_event_id));
    const forecast = buildForecasts(target, earlier, target.snapshot_at).find(r => r.cohort === 'opponent_3_50_plus');
    return { ...target, day: matchDay(target), bucket: forecast?.bucket_probability ?? null,
      rich: forecast?.rich_probability ?? null, earlier: earlier.length,
      profit: target.y * target.m.favourite - 1 };
  }).sort((a,b) => a.advertised_start_at.localeCompare(b.advertised_start_at) || `${a.league}:${a.source_event_id}`.localeCompare(`${b.league}:${b.source_event_id}`));
}

// Use a reproducible pseudo-random stream only for uncertainty resampling, never for selecting matches.
function randomGenerator(seed = 8152026) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

// Percentile intervals describe sampled-day variability; they are not multiple-testing-adjusted evidence.
function interval(values) {
  if (!values.length) return null;
  values.sort((a,b) => a-b);
  return [values[Math.floor(0.025 * (values.length-1))], values[Math.floor(0.975 * (values.length-1))]];
}

// Resample complete NZ match days to preserve within-day dependence in observed unit returns.
function returnInterval(rows) {
  const groups = [...Map.groupBy(rows, r => r.day).values()];
  if (groups.length < 2) return null;
  const random = randomGenerator();
  const values = [];
  const aggregates = groups.map(group => ({ n: group.length, profit: group.reduce((s,r) => s+r.profit, 0) }));
  for (let i = 0; i < 2000; i++) {
    let n = 0, profit = 0;
    for (let j = 0; j < groups.length; j++) { const group = aggregates[Math.floor(random()*groups.length)]; n += group.n; profit += group.profit; }
    values.push(100 * profit/n);
  }
  return interval(values);
}

// Resample candidate and baseline together so overlapping matches do not imply independent evidence.
function pairedReturnDifference(rows, select) {
  const groups = [...Map.groupBy(rows, r => r.day).values()];
  if (groups.length < 2) return null;
  const random = randomGenerator();
  const aggregates = groups.map(group => ({ n:group.length, net:group.reduce((s,r)=>s+r.profit,0),
    selected:group.filter(select).length, selectedNet:group.filter(select).reduce((s,r)=>s+r.profit,0) }));
  const differences=[];
  for(let i=0;i<2000;i++) {
    let n=0,net=0,selected=0,selectedNet=0;
    for(let j=0;j<groups.length;j++) { const g=aggregates[Math.floor(random()*groups.length)]; n+=g.n;net+=g.net;selected+=g.selected;selectedNet+=g.selectedNet; }
    if(selected) differences.push(100*(selectedNet/selected-net/n));
  }
  return interval(differences);
}

// Pair probability losses on the same match days; negative differences favour the candidate score.
function brierDifference(rows, predict) {
  const groups=[...Map.groupBy(rows,r=>r.day).values()];
  if(groups.length<2) return null;
  const random=randomGenerator(), differences=[];
  const aggregates=groups.map(group=>({n:group.length,delta:group.reduce((sum,r)=>sum+(predict(r)-r.y)**2-(r.m.probability-r.y)**2,0)}));
  for(let i=0;i<2000;i++) {
    let n=0,delta=0;
    for(let j=0;j<groups.length;j++) {const g=aggregates[Math.floor(random()*groups.length)];n+=g.n;delta+=g.delta;}
    differences.push(delta/n);
  }
  return interval(differences);
}

// Report empirical outcomes at retained prices, with draws losing and no fabricated void returns.
export function metrics(rows, uncertainty = false) {
  const n = rows.length;
  const wins = rows.reduce((s,r) => s+r.y, 0);
  const profit = rows.reduce((s,r) => s+r.profit, 0);
  return { n, days: new Set(rows.map(r => r.day)).size, wins, winRate: n ? 100*wins/n : null,
    meanOdds: n ? rows.reduce((s,r) => s+r.m.favourite,0)/n : null,
    net: profit, roi: n ? 100*profit/n : null,
    roi95DayBootstrap: uncertainty ? returnInterval(rows) : undefined };
}

// Compare all probability models on exactly the same matches, excluding unavailable learned estimates.
function probabilityScores(rows) {
  const paired = rows.filter(r => r.bucket !== null && r.rich !== null && r.m.other >= 3.5);
  return { n: paired.length, leagues: Object.fromEntries([...Map.groupBy(paired,r=>r.league)].map(([league,group])=>[league,group.length])), models: Object.entries({ market:r=>r.m.probability, bucket:r=>r.bucket, context:r=>r.rich,
    marketContextBlend:r=>(r.m.probability+r.rich)/2, threeWayBlend:r=>(r.m.probability+r.rich+r.bucket)/3 }).map(([model, predict]) => {
    let brier=0, logLoss=0, predicted=0;
    for (const r of paired) { const p=predict(r), clipped=Math.max(1e-6,Math.min(1-1e-6,p));
      brier+=(p-r.y)**2; logLoss-=r.y*Math.log(clipped)+(1-r.y)*Math.log(1-clipped); predicted+=p; }
    return { model, brier:paired.length?brier/paired.length:null, logLoss:paired.length?logLoss/paired.length:null,
      meanProbability:paired.length?predicted/paired.length:null, brierDifference95:brierDifference(paired,predict) };
  }) };
}

// Use a shared chronological 70/30 date split without optimising thresholds on either segment.
export function analyse(input) {
  const rows = observations(input.results, input.fetchedAt);
  const days = [...new Set(rows.map(r => r.day))].sort();
  const split = days[Math.floor(days.length * 0.7)] ?? null;
  const recent = rows.filter(r=>r.day>=split);
  const first = rows.filter(r=>r.day<split);
  const candidates = CANDIDATES.map(({key,label,select}) => {
    const selected = rows.filter(select);
    const coverage = r => r.m.other>=3.5 && (['context65','blend65','blend_edge'].includes(key)?r.rich!==null:key==='consensus65'?r.rich!==null&&r.bucket!==null:key==='bucket65'?r.bucket!==null:true);
    return { key,label,full:metrics(selected,true),
      captureWithin24h:metrics(selected.filter(r=>Date.parse(r.advertised_start_at)-Date.parse(r.snapshot_at)<=DAY)),
      roiDifference95: key==='all'?null:pairedReturnDifference(rows.filter(coverage),select),
      recentRoiDifference95: key==='all'?null:pairedReturnDifference(recent.filter(coverage),select), earlier:metrics(first.filter(select)), recent:metrics(recent.filter(select),true),
      leagues:LEAGUES.map(league=>({league,...metrics(selected.filter(r=>r.league===league))})),
      withoutLeague:LEAGUES.map(league=>({excluded:league,...metrics(selected.filter(r=>r.league!==league))})),
      recentSameCoverageBaseline:metrics(recent.filter(coverage)) };
  });
  const forward = input.forward ?? [];
  return { method:'fixed_rules_chronological_24h_embargo_v1', fetchedAt:input.fetchedAt,
    inputSha256:createHash('sha256').update(JSON.stringify(input.results)).digest('hex'),
    coverage:{sourceRows:input.results.length, usable:rows.length, excludedOrDuplicate:input.results.length-rows.length,
      firstDay:days[0],lastDay:days.at(-1),days:days.length,recentFrom:split,earlier:first.length,recent:recent.length,
      leagues:LEAGUES.map(league=>({league,source:input.results.filter(r=>r.league===league).length,...metrics(rows.filter(r=>r.league===league))})),
      opponentRichAvailable:rows.filter(r=>r.m.other>=3.5&&r.rich!==null).length,
      opponentBucketAvailable:rows.filter(r=>r.m.other>=3.5&&r.bucket!==null).length},
    overlaps:CANDIDATES.slice(1).map(a=>({key:a.key,identicalSelections:CANDIDATES.filter(b=>b.key!==a.key&&rows.every(r=>a.select(r)===b.select(r))).map(b=>b.key)})),
    candidates, probabilities:{full:probabilityScores(rows),recent:probabilityScores(recent)},
    frozenForward: ['exact_2','plus_2','opponent_3_50_plus'].map(cohort=>{
      const group=forward.filter(r=>r.cohort===cohort), settled=group.filter(r=>r.outcome_status==='settled');
      return {cohort,recorded:group.length,settled:settled.length,pending:group.filter(r=>r.outcome_status==='pending').length,
        wins:settled.filter(r=>r.won).length,net:settled.reduce((s,r)=>s+Number(r.unit_return)-1,0)};
    }) };
}

// Offline-only research entrypoint: supplied snapshots are read locally and no production state is modified.
async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error('Usage: node analyse-football-model-candidates.mjs INPUT.json OUTPUT.json');
  const input = JSON.parse(await readFile(inputPath,'utf8'));
  const report = analyse(input);
  await writeFile(outputPath, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({coverage:report.coverage,candidates:report.candidates.map(({key,full,earlier,recent})=>({key,full,earlier,recent})),probabilities:report.probabilities,frozenForward:report.frozenForward},null,2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
