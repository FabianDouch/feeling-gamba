import { runHalfTimeFullTimeReconciliation } from "./team-sport-half-time-full-time.mjs";

const NRL_CONFIG = {
  matchTable: "nrl_matches",
  resultTable: "nrl_half_time_full_time_results",
  snapshotTable: "nrl_half_time_full_time_snapshots",
  sport: "nrl",
};

runHalfTimeFullTimeReconciliation(NRL_CONFIG, process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
