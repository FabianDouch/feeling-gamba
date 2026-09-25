import assert from "node:assert/strict";
import test from "node:test";
import { getNationsleagueSeasonYear } from "../scripts/lib/nationsleague.mjs";
import { mapMatch } from "../scripts/refresh-nationsleague-results-from-official.mjs";
import { mapOutcome } from "../scripts/reconcile-nationsleague-fixed-win-snapshots.mjs";

const options = { competitionId: 2014, season: 2027 };
const match = {
  id: "example",
  homeTeam: { id: "1", internationalName: "Portugal" },
  awayTeam: { id: "2", internationalName: "Spain" },
  status: "FINISHED",
  matchday: { sequenceNumber: "3" },
};
const snapshot = {
  matched_nationsleague_match_id: "example",
  advertised_start_at: "2026-09-24T18:45:00Z",
  home_team_name: "Portugal",
  away_team_name: "Spain",
  favourite_team_name: "Spain",
  home_fixed_win_price: 3.5,
  away_fixed_win_price: 1.9,
  favourite_fixed_win_price: 1.9,
  draw_fixed_win_price: 3.2,
};

test("biennial season includes the following March play-offs", () => {
  for (const date of ["2026-09-23", "2027-06-20", "2027-09-23", "2028-03-31"]) {
    assert.equal(getNationsleagueSeasonYear(new Date(date)), 2027);
  }
  assert.equal(getNationsleagueSeasonYear(new Date("2028-09-01")), 2029);
});

test("upcoming or missing scores cannot become settled zero-zero results", () => {
  for (const score of [undefined, { regular: { home: null, away: null } }, { total: { home: 0, away: 0 } }]) {
    const row = mapMatch({ ...match, score }, options);
    assert.equal(row.result_status, "pending");
    assert.equal(row.home_score, null);
    assert.notEqual(mapOutcome(snapshot, row).outcomeStatus, "settled");
  }
  assert.notEqual(mapOutcome(snapshot, { result_status: "settled", home_score: null, away_score: null }).outcomeStatus, "settled");
});

test("extra time and penalties cannot change a regulation draw", () => {
  const row = mapMatch({ ...match, score: {
    regular: { home: 2, away: 2 }, total: { home: 3, away: 2 }, penalty: { home: 5, away: 4 },
  } }, options);
  assert.equal(row.result_status, "settled");
  assert.equal(row.round_number, 3);
  const outcome = mapOutcome(snapshot, row);
  assert.equal(outcome.row.match_drawn, true);
  assert.equal(outcome.row.favourite_won, false);
  assert.equal(outcome.row.favourite_win_return, 0);
  assert.equal(outcome.row.home_win_return, 0);
});

test("an explicit zero-zero draw settles and a favourite win pays captured odds", () => {
  const draw = mapMatch({ ...match, score: { regular: { home: 0, away: 0 } } }, options);
  assert.equal(mapOutcome(snapshot, draw).row.match_drawn, true);
  const win = mapMatch({ ...match, score: { regular: { home: 0, away: 1 } } }, options);
  assert.equal(mapOutcome(snapshot, win).row.favourite_win_return, 1.9);
});

test("country aliases apply to winner settlement", () => {
  const row = mapMatch({ ...match, homeTeam: { id: "1", internationalName: "Czechia" }, score: { regular: { home: 2, away: 0 } } }, options);
  const outcome = mapOutcome({ ...snapshot, home_team_name: "Czech Republic", favourite_team_name: "Czech Republic", favourite_fixed_win_price: 3.5 }, row);
  assert.equal(outcome.row.favourite_won, true);
  assert.equal(outcome.row.favourite_win_return, 3.5);
});
