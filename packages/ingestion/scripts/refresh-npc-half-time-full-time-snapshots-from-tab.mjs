import { runHalfTimeFullTimeCapture } from "./team-sport-half-time-full-time.mjs";

const NPC_CONFIG = {
  category: "RUGBY_UNION",
  competitionSlug: "new-zealand-npc",
  matchTable: "npc_matches",
  officialSource: "official_provincial_rugby",
  resultTable: "npc_half_time_full_time_results",
  snapshotTable: "npc_half_time_full_time_snapshots",
  sourceLabel: "NPC half-time/full-time market source",
  sport: "npc",
};

runHalfTimeFullTimeCapture(NPC_CONFIG, process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
