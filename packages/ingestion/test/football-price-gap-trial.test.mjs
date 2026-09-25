import assert from "node:assert/strict";
import test from "node:test";
import { market, inCohort, trainingRows, generateTrial, settleTrial, fitRich } from "../scripts/lib/football-price-gap-trial.mjs";
import { refreshTrial } from "../scripts/refresh-football-price-gap-trial.mjs";

const now = "2026-09-25T10:00:00Z";
// Use realistic three-way prices and a strictly pre-kickoff capture.
function snapshot(overrides = {}) {
  return { league: "epl", source_event_id: "next", source_snapshot_key: "tab:next",
    snapshot_at: "2026-09-25T09:50:00Z", advertised_start_at: "2026-09-25T11:00:00Z",
    home_team_name: "Home", away_team_name: "Away", home_fixed_win_price: 1.8,
    away_fixed_win_price: 3.8, draw_fixed_win_price: 3.5, ...overrides };
}
// Training is source-backed settled data observed before the prospective generation cutoff.
function history(count = 120) {
  return Array.from({ length: count }, (_, i) => snapshot({ source_event_id: `past-${i}`,
    snapshot_at: "2026-09-20T09:00:00Z", advertised_start_at: "2026-09-20T10:00:00Z",
    observed_at: "2026-09-20T12:00:00Z", outcome_status: "settled",
    home_team_won: i % 3 !== 0, away_team_won: false, match_drawn: i % 3 === 0 }));
}

test("normalises all three prices and rejects incomplete/tied markets", () => {
  const m = market(snapshot());
  assert.ok(Math.abs(m.probability - (1 / 1.8) / (1 / 1.8 + 1 / 3.8 + 1 / 3.5)) < 1e-12);
  for (const draw_fixed_win_price of [null, "", "n/a", 1, Infinity]) assert.equal(market(snapshot({ draw_fixed_win_price })), null);
  assert.equal(market(snapshot({ away_fixed_win_price: 1.8 })), null);
  assert.ok(market(snapshot({ draw_fixed_win_price: 2.8 })).probability < m.probability);
});

test("separates exact and cumulative boundaries including decimal rounding", () => {
  assert.equal(inCohort(market(snapshot()), "exact_2"), true);
  assert.equal(inCohort({ gap: 1.99 }, "plus_2"), false);
  assert.equal(inCohort({ gap: 2.49 }, "exact_2"), true);
  assert.equal(inCohort({ gap: 2.5 }, "exact_2"), false);
  assert.equal(inCohort({ gap: 2.5 }, "plus_2"), true);
});

test("training deduplicates events and excludes unknown, future and late-captured rows", () => {
  const valid = history(1)[0];
  const bad = [
    { source_event_id: "future", advertised_start_at: "2026-09-26T10:00:00Z" },
    { source_event_id: "late", snapshot_at: "2026-09-20T10:01:00Z" },
    { source_event_id: "unknown", outcome_status: "pending" },
    { source_event_id: "unobserved", observed_at: "2026-09-25T10:01:00Z" },
    { source_event_id: "bad", home_team_won: true, away_team_won: true },
    { source_event_id: "null", observed_at: null },
  ].map((r) => ({ ...valid, ...r }));
  assert.equal(trainingRows([valid, valid, ...bad], now).length, 1);
  assert.equal(trainingRows([valid], now)[0].y, 0, "draw is a favourite loss");
});

test("learned models abstain on sparse history and only enable at fixed thresholds", () => {
  const sparse = generateTrial([snapshot()], history(29), now)[0];
  assert.equal(sparse.bucket_probability, null);
  assert.equal(sparse.rich_probability, null);
  const bucket = generateTrial([snapshot()], history(30), now)[0];
  assert.equal(bucket.bucket_probability, 2 / 3);
  assert.equal(bucket.rich_probability, null);
  const rich = generateTrial([snapshot()], history(), now)[0];
  assert.ok(rich.rich_probability > rich.market_probability && rich.rich_probability < 1);
  assert.equal(rich.rich_sample, 120);
  assert.equal(rich.training.weights.length, 15);
  assert.equal(generateTrial([snapshot({ league: "ucl" })], history(), now)[0].rich_probability, null);
});

test("richer model abstains without enough wins and losses", () => {
  assert.equal(fitRich(trainingRows(history().map((r) => ({ ...r, home_team_won: true, match_drawn: false })), now)), null);
});

test("rejects stale, post-kickoff, future-captured and distant candidates", () => {
  for (const overrides of [
    { snapshot_at: "2026-09-25T08:59:59Z" },
    { snapshot_at: "2026-09-25T10:00:01Z" },
    { advertised_start_at: now },
    { advertised_start_at: "2026-09-26T10:00:01Z" },
    { source_event_id: "past-1" },
  ]) assert.equal(generateTrial([snapshot(overrides)], history(), now).length, 0);
});

test("a source-known settlement cannot become a prospective forecast after rescheduling", () => {
  const result = { ...history(1)[0], ...snapshot(), outcome_status: "settled" };
  assert.equal(generateTrial([snapshot()], [result], now).length, 0);
});

test("each event/cohort occurs once and future outcomes cannot change the forecast", () => {
  const rows = generateTrial([snapshot(), snapshot()], history(), now);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows, generateTrial([snapshot()], [...history(), ...history().map((r) => ({
    ...r, source_event_id: `future-${r.source_event_id}`, observed_at: "2026-09-26T12:00:00Z",
  }))], now));
  assert.deepEqual(rows, generateTrial([snapshot()], history().reverse(), now));
});

test("settlement uses frozen team and odds even if the later favourite changes", () => {
  const prediction = generateTrial([snapshot()], [], now)[0];
  const result = { ...snapshot(), outcome_status: "settled", home_team_won: true, away_team_won: false,
    match_drawn: false, home_fixed_win_price: 4, away_fixed_win_price: 1.5 };
  const update = settleTrial(prediction, result, "2026-09-25T14:00:00Z");
  assert.equal(update.won, true);
  assert.equal(update.unit_return, 1.8);
  assert.equal(settleTrial(prediction, { ...result, home_team_won: false, match_drawn: true }, "2026-09-25T14:00:00Z").unit_return, 0);
  assert.equal(settleTrial(prediction, result, now), null);
});

test("unknown or changed fixtures never fabricate settlement", () => {
  const prediction = generateTrial([snapshot()], [], now)[0];
  const result = { ...snapshot(), outcome_status: "settled", home_team_won: true, away_team_won: false, match_drawn: false };
  for (const overrides of [{ home_team_name: "Replacement" }, { advertised_start_at: "2026-09-25T09:00:00Z" }, { outcome_status: "non_standard" }]) {
    const update = settleTrial(prediction, { ...result, ...overrides }, "2026-09-25T14:00:00Z");
    assert.equal(update.outcome_status, "excluded");
    assert.equal(update.unit_return, null);
  }
  assert.equal(settleTrial(prediction, { ...result, match_drawn: true }, "2026-09-25T14:00:00Z").outcome_status, "pending");
  assert.equal(settleTrial(prediction, { ...result, advertised_start_at: null }, "2026-09-25T14:00:00Z").outcome_status, "pending");
  assert.equal(settleTrial(prediction, { ...result, advertised_start_at: "2026-09-26T11:00:00Z" }, "2026-09-25T14:00:00Z").outcome_status, "pending");
});

test("dry runs never write and reruns preserve already recorded forecasts", async () => {
  const clock = Date.now();
  const current = snapshot({ snapshot_at: new Date(clock - 60000).toISOString(), advertised_start_at: new Date(clock + 3600000).toISOString() });
  const existing = generateTrial([current], [], new Date(clock).toISOString());
  const writes = [];
  const client = {
    all: async (table) => table === "football_price_gap_predictions" ? existing : table === "epl_market_snapshots" ? [current] : [],
    request: async (...args) => writes.push(args),
  };
  assert.equal((await refreshTrial(client, { dryRun: true })).newForecasts, 0);
  assert.equal((await refreshTrial(client)).newForecasts, 0);
  assert.equal(writes.length, 0);
  client.all = async (table) => table === "epl_market_snapshots" ? [current] : [];
  assert.equal((await refreshTrial(client, { dryRun: true })).newForecasts, 2);
  assert.equal(writes.length, 0);
  await refreshTrial(client);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][4], "resolution=ignore-duplicates,return=minimal");
});
