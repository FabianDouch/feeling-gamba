import { runHalfTimeFullTimeCapture } from "./team-sport-half-time-full-time.mjs";

const NRL_CONFIG = {
  category: "RUGBY_LEAGUE",
  competitionSlug: "nrl",
  matchTable: "nrl_matches",
  officialSource: "official_nrl",
  resultTable: "nrl_half_time_full_time_results",
  snapshotTable: "nrl_half_time_full_time_snapshots",
  sourceLabel: "NRL half-time/full-time market source",
  sport: "nrl",
};

runHalfTimeFullTimeCapture(NRL_CONFIG, process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
