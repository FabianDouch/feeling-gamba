import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixturesDir = path.join(repoRoot, "apps/mobile/src/data/fixtures");
const dailyFixturePattern = /^pilot-tracks-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Loads every bundled daily race fixture in date order for deterministic parser checks.
 */
async function loadDailyFixtures() {
  const files = (await readdir(fixturesDir))
    .filter((file) => dailyFixturePattern.test(file))
    .sort();

  const fixtures = await Promise.all(
    files.map(async (file) => ({
      file,
      fixture: JSON.parse(await readFile(path.join(fixturesDir, file), "utf8")),
    })),
  );

  return fixtures;
}

/**
 * Normalises country metadata so older AU fixture values compare with AUS meetings.
 */
function normalizeCountry(value) {
  return value === "AU" ? "AUS" : value ?? "Unknown";
}

/**
 * Returns active runners only, matching the local parser's starter-count rule.
 */
function activeRunnerRows(raceCard) {
  return (raceCard.finalField?.runnerRows ?? []).filter((runner) => {
    const isVacantBox = String(runner.name ?? "").trim().toLowerCase() === "vacant box";
    return !runner.scratchedTimestamp && !isVacantBox;
  });
}

/**
 * Applies the bet-back starter thresholds used by historical bonus-value stats.
 */
function getBonusBetCredit(resultPosition, starterCount) {
  if (resultPosition === 2 && starterCount >= 5) {
    return 1;
  }

  if (resultPosition === 3 && starterCount >= 8) {
    return 1;
  }

  return 0;
}

/**
 * Formats a UTC date object as the fixture filename date segment.
 */
function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

/**
 * Builds the inclusive expected date range for the bundled daily fixture files.
 */
function listIsoDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Flattens bundled fixtures into the race rows consumed by the local app adapter.
 */
function collectRaces(fixtures) {
  return fixtures.flatMap(({ file, fixture }) => (
    fixture.meetings ?? []
  ).flatMap((meeting) => (
    meeting.races ?? []
  ).map((race) => ({
    file,
    fixture,
    meeting,
    race,
  }))));
}

/**
 * Builds track-option labels from fixture metadata for a single country filter.
 */
function trackOptionsForCountry(fixtures, country) {
  const tracks = new Set();

  for (const { fixture } of fixtures) {
    for (const track of fixture.filters?.pilotTracks ?? []) {
      if (country === "all" || normalizeCountry(track.country) === country) {
        tracks.add(track.canonicalName);
      }
    }

    for (const meeting of fixture.meetings ?? []) {
      const meetingCountry = normalizeCountry(meeting.source?.venue?.country);
      if (country === "all" || meetingCountry === country) {
        tracks.add(meeting.canonicalTrack);
      }
    }
  }

  return [...tracks].sort();
}

describe("local race fixture pipeline", () => {
  it("loads the expected collected daily fixture range", async () => {
    const fixtures = await loadDailyFixtures();
    const dates = fixtures.map(({ fixture }) => fixture.testDate);
    const latestDate = dates.at(-1);

    assert.equal(fixtures[0].file, "pilot-tracks-2025-12-15.json");
    assert.equal(dates[0], "2025-12-15");
    assert.ok(latestDate >= "2026-06-15");
    assert.equal(new Set(dates).size, fixtures.length);
    assert.deepEqual(dates, listIsoDates("2025-12-15", latestDate));
  });

  it("keeps source race-card IDs unique after local row flattening", async () => {
    const races = collectRaces(await loadDailyFixtures());
    const raceIds = races.map(({ race }) => race.raceCardId);

    assert.ok(races.length > 500, "expected a meaningful local fixture set");
    assert.equal(new Set(raceIds).size, raceIds.length);
  });

  it("derives country-scoped track options from pilot tracks and collected meetings", async () => {
    const fixtures = await loadDailyFixtures();
    const nzTracks = trackOptionsForCountry(fixtures, "NZ");
    const ausTracks = trackOptionsForCountry(fixtures, "AUS");

    assert.ok(nzTracks.includes("Addington"));
    assert.ok(nzTracks.includes("Cambridge"));
    assert.ok(!nzTracks.includes("Doomben"));
    assert.ok(ausTracks.includes("Doomben"));
    assert.ok(ausTracks.includes("Townsville"));
    assert.ok(ausTracks.includes("Q1 Lakeside"));
    assert.ok(!ausTracks.includes("Addington"));
  });

  it("counts active starters from race-card rows without vacant boxes or scratchings", async () => {
    const races = collectRaces(await loadDailyFixtures());
    const raceWithInactiveRows = races.find(({ race }) => {
      const rows = race.raceCard.finalField?.runnerRows ?? [];
      return rows.some((runner) => (
        runner.scratchedTimestamp
        || String(runner.name ?? "").trim().toLowerCase() === "vacant box"
      ));
    });

    assert.ok(raceWithInactiveRows, "expected at least one race with scratched or vacant rows");
    assert.equal(
      activeRunnerRows(raceWithInactiveRows.race.raceCard).length,
      raceWithInactiveRows.race.derived.activeStarterCount,
    );
  });

  it("applies starter-count eligibility to second and third place bonus credits", () => {
    assert.equal(getBonusBetCredit(2, 4), 0);
    assert.equal(getBonusBetCredit(2, 5), 1);
    assert.equal(getBonusBetCredit(3, 7), 0);
    assert.equal(getBonusBetCredit(3, 8), 1);
    assert.equal(getBonusBetCredit(1, 8), 0);
    assert.equal(getBonusBetCredit(null, 8), 0);
  });

  it("identifies third-place favourite results that must not earn bonus credit", async () => {
    const races = collectRaces(await loadDailyFixtures());
    const ineligibleThirds = races.flatMap(({ race }) => (
      race.derived.favourites ?? []
    ).filter((favourite) => (
      favourite.resultPosition === 3
      && getBonusBetCredit(favourite.resultPosition, race.derived.activeStarterCount) === 0
    )));

    assert.ok(
      ineligibleThirds.length > 0,
      "expected the fixture set to cover small-field third-place bonus exclusions",
    );
  });

  it("excludes missing favourite results from recomputed settled denominators", async () => {
    const fixtures = await loadDailyFixtures();
    const races = collectRaces(fixtures);
    const favouriteSelections = races.flatMap(({ race }) => (
      race.derived.favourites ?? []
    ));
    const priceableSelections = favouriteSelections.filter((favourite) =>
      Number.isFinite(favourite.fixedWinPrice));
    const missingResultSelections = priceableSelections.filter((favourite) =>
      favourite.resultPosition === null);
    const settledSelections = priceableSelections.filter((favourite) =>
      favourite.resultPosition !== null);

    assert.ok(missingResultSelections.length > 0, "expected abandoned or pending-result races");
    assert.ok(settledSelections.length < priceableSelections.length);
    assert.equal(
      settledSelections.length + missingResultSelections.length,
      priceableSelections.length,
    );
  });
});
