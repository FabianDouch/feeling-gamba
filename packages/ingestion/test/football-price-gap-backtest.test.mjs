import assert from "node:assert/strict";
import test from "node:test";
import { replayFootballHistory } from "../scripts/lib/football-price-gap-backtest.mjs";
import { backfillFootballHistory } from "../scripts/backfill-football-price-gap-history.mjs";

const builtAt = "2026-09-25T10:00:00Z";
// Build a settled source row with retained pre-match three-way odds, including draws.
function result(id, kickoff, won = true, extra = {}) {
  return { league: "epl", source_event_id: id, source_snapshot_key: `tab:${id}`,
    advertised_start_at: kickoff, snapshot_at: new Date(Date.parse(kickoff) - 3600000).toISOString(),
    home_team_name: "Home", away_team_name: "Away", home_fixed_win_price: 1.8,
    away_fixed_win_price: 3.8, draw_fixed_win_price: 3.5, outcome_status: "settled",
    home_team_won: won, away_team_won: false, match_drawn: !won, ...extra };
}

test("replays existing settled history immediately without a forward collection window", () => {
  const replay = replayFootballHistory([result("old", "2026-08-01T10:00:00Z", false)], builtAt);
  assert.equal(replay.rows.length, 2);
  assert.equal(replay.summary.replayedMatches, 1);
  assert.equal(replay.rows[0].won, false);
  assert.equal(replay.rows[0].unit_return, 0);
  assert.equal(replay.rows[0].predicted_at, "2026-08-01T09:00:00.000Z");
  assert.equal(replay.rows[0].training.backtest.resultAvailabilityVerified, false);
  assert.equal(replay.rows[0].training.backtest.generatedAt, builtAt);
  assert.equal(replay.rows[0].bucket_probability, null);
});

test("24-hour embargo excludes the target, simultaneous games, recent and future outcomes", () => {
  const rows = [result("target", "2026-09-10T10:00:00Z"),
    result("boundary", "2026-09-09T09:00:00Z"),
    result("too-recent", "2026-09-09T09:00:01Z"),
    result("simultaneous", "2026-09-10T10:00:00Z"),
    result("future", "2026-09-11T10:00:00Z")];
  const target = replayFootballHistory(rows, builtAt).rows.find((r) => r.source_event_id === "target");
  assert.equal(target.rich_sample, 1);
  assert.equal(target.bucket_sample, 1);
  assert.equal(target.training.backtest.latestTrainingKickoff, rows[1].advertised_start_at);
});

test("flipping target/future results cannot change the target's reconstructed probability", () => {
  const earlier = Array.from({ length: 120 }, (_, i) => result(`earlier-${i}`, "2026-09-01T10:00:00Z", i % 3 !== 0));
  const target = result("target", "2026-09-10T10:00:00Z");
  const future = result("future", "2026-09-11T10:00:00Z");
  const a = replayFootballHistory([...earlier, target, future], builtAt).rows.find((r) => r.source_event_id === "target");
  const b = replayFootballHistory([...earlier, { ...target, home_team_won: false, match_drawn: true },
    { ...future, home_team_won: false, match_drawn: true }], builtAt).rows.find((r) => r.source_event_id === "target");
  assert.equal(a.bucket_probability, 2 / 3);
  assert.ok(a.rich_probability !== null);
  for (const key of ["bucket_probability", "rich_probability", "market_probability", "rich_sample"]) assert.equal(a[key], b[key]);
  assert.equal(a.training.digest, b.training.digest);
  assert.notEqual(a.unit_return, b.unit_return);
});

test("unpriced, late snapshots, unknown and future fixtures never enter replay scoring", () => {
  const base = result("base", "2026-09-10T10:00:00Z");
  const invalid = [{ source_event_id: "price", draw_fixed_win_price: null },
    { source_event_id: "late", snapshot_at: base.advertised_start_at },
    { source_event_id: "pending", outcome_status: "pending" },
    { source_event_id: "future", advertised_start_at: "2026-10-01T10:00:00Z" },
    { source_event_id: "conflict", away_team_won: true }].map((r) => ({ ...base, ...r }));
  const replay = replayFootballHistory([base, base, ...invalid], builtAt);
  assert.equal(replay.summary.usablePricedMatches, 1);
  assert.equal(replay.summary.excludedOrDuplicateSourceRows, 6);
  assert.equal(replay.rows.length, 2);
});

test("later stored captures cannot train earlier targets, even when results are known today", () => {
  const rows = [result("first", "2026-09-10T10:00:00Z"),
    result("early-price", "2026-09-11T10:00:00Z", true, { snapshot_at: "2026-09-09T10:00:00Z" })];
  const replay = replayFootballHistory(rows, builtAt);
  assert.ok(replay.rows.every((r) => r.rich_sample === 0));
  assert.deepEqual(replay.rows, replayFootballHistory(rows.reverse(), builtAt).rows);
});

test("backfill dry run is read-only; writes replace only backtests after complete source reads", async () => {
  const calls = [];
  const client = {
    all: async (table) => table === "epl_fixed_win_snapshot_results" ? [result("old", "2026-08-01T10:00:00Z")] : [],
    request: async (...args) => calls.push(args),
  };
  await backfillFootballHistory(client, { dryRun: true });
  assert.equal(calls.length, 0);
  await backfillFootballHistory(client);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "rpc/replace_football_price_gap_backtests");
  assert.equal(calls[0][3].p_rows.length, 2);
  calls.length = 0;
  client.all = async (table) => { if (table.startsWith("ucl_")) throw new Error("source unavailable"); return []; };
  await assert.rejects(backfillFootballHistory(client), /source unavailable/);
  assert.equal(calls.length, 0);
});
