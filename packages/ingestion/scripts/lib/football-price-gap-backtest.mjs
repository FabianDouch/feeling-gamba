import { buildForecasts, trainingRows } from "./football-price-gap-trial.mjs";

export const BACKTEST_METHOD = "chronological_24h_embargo_v1";
export const RESULT_EMBARGO_MS = 24 * 60 * 60 * 1000;

// Replay captured pre-match odds chronologically; result availability is an explicit assumption.
export function replayFootballHistory(results, generatedAt) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("A valid backtest build timestamp is required.");
  // These are historical inputs available to this reconstruction, not historical observation timestamps.
  const usable = trainingRows(results.map((row) => ({ ...row, observed_at: generatedAt })), generatedAt);
  const rows = [];
  for (const target of usable) {
    if (target.m.gap < 2) continue;
    const cutoff = Date.parse(target.snapshot_at);
    const earlier = usable.filter((row) => Date.parse(row.advertised_start_at) + RESULT_EMBARGO_MS <= cutoff
      && !(row.league === target.league && row.source_event_id === target.source_event_id));
    for (const prediction of buildForecasts(target, earlier, target.snapshot_at)) {
      rows.push({ ...prediction, outcome_status: "settled", won: Boolean(target.y),
        unit_return: target.y * target.m.favourite, settled_at: generatedAt,
        training: { ...prediction.training, backtest: { method: BACKTEST_METHOD, generatedAt,
          cutoff: target.snapshot_at, embargoHours: 24, resultAvailabilityVerified: false,
          latestTrainingKickoff: earlier.map((row) => row.advertised_start_at).sort().at(-1) ?? null } },
      });
    }
  }
  rows.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)
    || `${a.league}:${a.source_event_id}:${a.cohort}`.localeCompare(`${b.league}:${b.source_event_id}:${b.cohort}`));
  return { rows, summary: { method: BACKTEST_METHOD, generatedAt, sourceRows: results.length,
    usablePricedMatches: usable.length, excludedOrDuplicateSourceRows: results.length - usable.length,
    replayedMatches: new Set(rows.map((r) => `${r.league}:${r.source_event_id}`)).size,
    cohorts: ["exact_2", "plus_2"].map((cohort) => {
      const group = rows.filter((r) => r.cohort === cohort);
      return { cohort, matches: group.length, wins: group.filter((r) => r.won).length,
        bucketScored: group.filter((r) => r.bucket_probability !== null).length,
        richScored: group.filter((r) => r.rich_probability !== null).length,
        returned: Math.round(group.reduce((sum, r) => sum + r.unit_return, 0) * 100) / 100 };
    }) } };
}
