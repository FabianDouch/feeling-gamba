import { runHalfTimeFullTimeReconciliation } from "./team-sport-half-time-full-time.mjs";

const NPC_CONFIG = {
  matchTable: "npc_matches",
  resultTable: "npc_half_time_full_time_results",
  snapshotTable: "npc_half_time_full_time_snapshots",
  sport: "npc",
};

runHalfTimeFullTimeReconciliation(NPC_CONFIG, process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
