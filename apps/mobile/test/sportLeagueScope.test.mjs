import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSportScopeState, getSportScope, selectSportGroup, selectLeagueScope,
  getPredictionLeague, LEAGUE_OPTIONS,
} from "../src/navigation/sportLeagueScope.ts";

test("a sport remembers its league while other sports start at their own default", () => {
  let state = selectSportGroup(createSportScopeState(), "football");
  assert.deepEqual(getSportScope(state), { group: "football", league: "all_football" });
  state = selectLeagueScope(state, "epl");
  state = selectSportGroup(state, "rugby_union");
  assert.deepEqual(getSportScope(state), { group: "rugby_union", league: "all_rugby_union" });
  state = selectLeagueScope(state, "npc");
  state = selectSportGroup(state, "football");
  assert.equal(getSportScope(state).league, "epl");
  assert.equal(getSportScope(selectSportGroup(state, "rugby_union")).league, "npc");
});

test("invalid or cross-sport choices cannot redirect the selected reader", () => {
  const state = selectLeagueScope(selectSportGroup(createSportScopeState(), "football"), "ucl");
  for (const invalid of ["ufc", "racing", "unknown", "all_rugby_union"]) {
    assert.equal(selectLeagueScope(state, invalid), state);
  }
  assert.equal(selectSportGroup(state, "unknown"), state);
  assert.equal(getPredictionLeague(getSportScope(state)), "ucl");
});

test("legacy prediction routing leaves combined and cup scopes to their dedicated readers", () => {
  for (const [group, leagues] of Object.entries(LEAGUE_OPTIONS)) {
    for (const { value: league } of leagues) {
      const route = getPredictionLeague({ group, league });
      if (["all_football", "europaleague", "eflcup", "all_combat_sports", "tennis", "nfl"].includes(league)) {
        assert.equal(route, null, league);
      } else if (league.startsWith("all_rugby")) {
        assert.equal(route, league === "all_rugby_union" ? "npc" : "nrl");
      } else {
        assert.equal(route, league);
      }
    }
  }
});

test("football navigation retains all ten collected leagues including both cups", () => {
  assert.deepEqual(new Set(LEAGUE_OPTIONS.football.map(({ value }) => value)), new Set([
    "all_football", "ucl", "epl", "laliga", "nationsleague", "bundesliga", "seriea", "ligue1", "mls", "europaleague", "eflcup",
  ]));
});
