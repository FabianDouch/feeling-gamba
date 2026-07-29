import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_TIME_ZONE = "Pacific/Auckland";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOT_ENV_FILES = [".env.local", ".env"];
const MODEL_ORIGINAL = "multi_win_percentage_blend_v1";
const MODEL_60_PLUS = "multi_win_percentage_60_plus_v1";
const MODEL_65_PLUS = "multi_win_percentage_65_plus_v1";
const MODEL_UFC_FAVOURITE = "ufc_multi_favourite_price_win_percentage_v1";
const MODEL_UFC_OTHER = "ufc_multi_other_fighter_price_win_percentage_v1";
const MODEL_UFC_DIFFERENCE = "ufc_multi_price_difference_win_percentage_v1";
const RACING_MODELS = [MODEL_ORIGINAL, MODEL_60_PLUS, MODEL_65_PLUS];
const UFC_MODELS = [MODEL_UFC_FAVOURITE, MODEL_UFC_OTHER, MODEL_UFC_DIFFERENCE];

/**
 * Parses the small CLI surface for rebuilding generated historical backtests.
 */
function parseArgs(argv) {
  const options = {
    fromDate: null,
    requireSupabase: false,
    sport: "all",
    toDate: null,
  };

  for (const arg of argv) {
    if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--sport=")) {
      options.sport = arg.slice("--sport=".length);
    } else if (arg.startsWith("--from-date=")) {
      options.fromDate = arg.slice("--from-date=".length);
    } else if (arg.startsWith("--to-date=")) {
      options.toDate = arg.slice("--to-date=".length);
    }
  }

  if (!["all", "racing", "ufc"].includes(options.sport)) {
    throw new Error("Use --sport=all, --sport=racing, or --sport=ufc.");
  }

  return options;
}

/**
 * Loads repo-level env files without overriding already-exported shell values.
 */
async function loadDotEnvFiles() {
  for (const file of DOT_ENV_FILES) {
    try {
      const contents = await readFile(path.join(REPO_ROOT, file), "utf8");

      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

        if (!match || process.env[match[1]] !== undefined) {
          continue;
        }

        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * Reads the server-side Supabase write credentials accepted by local workers.
 */
function getSupabaseWriteConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.FEELING_GAMBA_SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    key,
    url: normalizeSupabaseProjectUrl(url),
  };
}

function normalizeSupabaseProjectUrl(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.protocol}//${url.host}`;
}

/**
 * Reads all REST rows across PostgREST pages.
 */
async function selectAll(config, table, params) {
  const rows = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = new URL(`/rest/v1/${table}`, config.url);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase ${table} read failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }

    offset += pageSize;
  }
}

/**
 * Deletes generated rows for the selected sport/date range before rebuilding them.
 */
async function deleteExistingBacktests(config, sport, fromDate, toDate) {
  const url = new URL("/rest/v1/historical_multi_backtest_recommendations", config.url);
  url.searchParams.set("sport", `eq.${sport}`);

  if (fromDate) {
    url.searchParams.set("source_date", `gte.${fromDate}`);
  }

  if (toDate) {
    url.searchParams.set("and", `(source_date.gte.${fromDate ?? "0001-01-01"},source_date.lte.${toDate})`);
    url.searchParams.delete("source_date");
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      prefer: "return=minimal",
    },
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Supabase historical backtest delete failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/**
 * Inserts recommendation rows and returns their generated IDs for leg inserts.
 */
async function insertRecommendations(config, rows) {
  if (!rows.length) {
    return [];
  }

  const inserted = [];

  for (const chunk of chunkRows(rows, 500)) {
    const response = await fetch(`${config.url}/rest/v1/historical_multi_backtest_recommendations`, {
      body: JSON.stringify(chunk),
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Supabase historical backtest insert failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    inserted.push(...await response.json());
  }

  return inserted;
}

/**
 * Inserts leg rows for generated historical recommendations.
 */
async function insertLegs(config, rows) {
  if (!rows.length) {
    return;
  }

  for (const chunk of chunkRows(rows, 1000)) {
    const response = await fetch(`${config.url}/rest/v1/historical_multi_backtest_legs`, {
      body: JSON.stringify(chunk),
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Supabase historical backtest legs insert failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }
}

/**
 * Creates racing multi backtests from prior racing rows only.
 */
function buildRacingBacktests(rows, fromDate, toDate) {
  const sortedRows = rows
    .filter((row) => row.meeting_date)
    .sort((left, right) => left.meeting_date.localeCompare(right.meeting_date)
      || String(left.advertised_start ?? "").localeCompare(String(right.advertised_start ?? "")));
  const dates = unique(sortedRows.map((row) => row.meeting_date)).sort();
  const output = [];

  for (const date of dates) {
    if ((fromDate && date < fromDate) || (toDate && date > toDate)) {
      continue;
    }

    const priorRows = sortedRows.filter((row) => row.meeting_date < date && isUsableRacingHistoryRow(row));
    const dayRows = sortedRows.filter((row) => row.meeting_date === date && isUsableRacingCandidate(row));

    if (priorRows.length < 30 || dayRows.length < 3) {
      continue;
    }

    const stats = buildRacingStats(priorRows);
    const candidates = dayRows
      .map((row) => createRacingCandidate(row, stats))
      .filter((candidate) => Number.isFinite(candidate.winScore))
      .sort(compareCandidates)
      .map((candidate, index) => ({
        ...candidate,
        predictionRank: index + 1,
      }));

    for (const model of RACING_MODELS) {
      const recommendation = createRacingRecommendation(date, model, candidates);

      if (recommendation) {
        output.push(recommendation);
      }
    }
  }

  return output;
}

/**
 * Creates UFC same-card multi backtests from prior UFC rows only.
 */
function buildUfcBacktests(rows, fromDate, toDate) {
  const sortedRows = rows
    .filter((row) => row.event_date)
    .sort((left, right) => left.event_date.localeCompare(right.event_date));
  const dates = unique(sortedRows.map((row) => row.event_date)).sort();
  const output = [];

  for (const date of dates) {
    if ((fromDate && date < fromDate) || (toDate && date > toDate)) {
      continue;
    }

    const priorRows = sortedRows.filter((row) => row.event_date < date && isUsableUfcHistoryRow(row));
    const dayRows = sortedRows.filter((row) => row.event_date === date && isUsableUfcCandidate(row));

    if (priorRows.length < 30 || dayRows.length < 3) {
      continue;
    }

    const stats = buildUfcStats(priorRows);
    const cards = groupBy(dayRows, (row) => `${row.event_date}:${row.event_name ?? "UFC card"}`);

    for (const [groupKey, cardRows] of cards) {
      if (cardRows.length < 3) {
        continue;
      }

      for (const model of UFC_MODELS) {
        const candidates = cardRows
          .map((row) => createUfcCandidate(row, stats, model))
          .filter((candidate) => Number.isFinite(candidate.winScore))
          .sort(compareCandidates)
          .map((candidate, index) => ({
            ...candidate,
            predictionRank: index + 1,
          }));
        const recommendation = createUfcRecommendation(date, groupKey, model, candidates);

        if (recommendation) {
          output.push(recommendation);
        }
      }
    }
  }

  return output;
}

function isUsableRacingHistoryRow(row) {
  return Number.isFinite(Number(row.favourite_price))
    && Number.isFinite(Number(row.starter_count))
    && Number.isFinite(Number(row.favourite_result_position));
}

function isUsableRacingCandidate(row) {
  return isUsableRacingHistoryRow(row)
    && row.favourite_runner_name
    && Number(row.favourite_price) > 1;
}

function isUsableUfcHistoryRow(row) {
  return row.included_in_insights === true
    && Number.isFinite(Number(row.favourite_price))
    && Number.isFinite(Number(row.other_fighter_price))
    && Number.isFinite(Number(row.price_difference))
    && typeof row.favourite_won === "boolean";
}

function isUsableUfcCandidate(row) {
  return isUsableUfcHistoryRow(row)
    && row.favourite_name
    && Number(row.favourite_price) > 1;
}

function buildRacingStats(rows) {
  return {
    byPriceBucket: buildBucketStats(rows, (row) => createPriceBucketLabel(getPriceBucketStart(Number(row.favourite_price))), (row) => Number(row.favourite_result_position) === 1),
    byStarterCount: buildBucketStats(rows, (row) => String(row.starter_count), (row) => Number(row.favourite_result_position) === 1),
  };
}

function buildUfcStats(rows) {
  return {
    byDifferenceBucket: buildBucketStats(rows, (row) => createPriceBucketLabel(getPriceDifferenceBucketStart(Number(row.price_difference))), (row) => row.favourite_won === true),
    byFavouriteBucket: buildBucketStats(rows, (row) => createPriceBucketLabel(getPriceBucketStart(Number(row.favourite_price))), (row) => row.favourite_won === true),
    byOtherBucket: buildBucketStats(rows, (row) => createPriceBucketLabel(getPriceBucketStart(Number(row.other_fighter_price))), (row) => row.favourite_won === true),
  };
}

function buildBucketStats(rows, getKey, isWin) {
  const buckets = new Map();

  for (const row of rows) {
    const key = getKey(row);
    const bucket = buckets.get(key) ?? {
      label: key,
      selections: 0,
      winPercentage: 0,
      wins: 0,
    };

    bucket.selections += 1;
    bucket.wins += isWin(row) ? 1 : 0;
    bucket.winPercentage = (bucket.wins / bucket.selections) * 100;
    buckets.set(key, bucket);
  }

  return buckets;
}

function createRacingCandidate(row, stats) {
  const priceBucketLabel = createPriceBucketLabel(getPriceBucketStart(Number(row.favourite_price)));
  const starterBucketLabel = String(row.starter_count);
  const priceBucket = stats.byPriceBucket.get(priceBucketLabel) ?? null;
  const starterBucket = stats.byStarterCount.get(starterBucketLabel) ?? null;
  const winScore = weightedAverage([
    { value: priceBucket?.winPercentage, weight: 0.65 },
    { value: starterBucket?.winPercentage, weight: 0.35 },
  ]);

  return {
    bucket: priceBucket,
    bucketLabel: priceBucketLabel,
    bucketSampleSize: priceBucket?.selections ?? 0,
    fixedWinPrice: Number(row.favourite_price),
    outcomeResultPosition: Number(row.favourite_result_position),
    outcomeWinReturn: Number(row.favourite_result_position) === 1 ? Number(row.favourite_price) : 0,
    participantName: row.favourite_runner_name,
    participantNumber: row.favourite_runner_number ?? null,
    raw: row,
    sourceEntryId: row.race_id,
    title: [
      row.course_name ?? "Unknown track",
      row.race_number ? `R${row.race_number}` : null,
      row.race_name ?? null,
    ].filter(Boolean).join(" · "),
    winScore,
  };
}

function createUfcCandidate(row, stats, model) {
  const favouriteBucketLabel = createPriceBucketLabel(getPriceBucketStart(Number(row.favourite_price)));
  const otherBucketLabel = createPriceBucketLabel(getPriceBucketStart(Number(row.other_fighter_price)));
  const differenceBucketLabel = createPriceBucketLabel(getPriceDifferenceBucketStart(Number(row.price_difference)));
  const bucket = model === MODEL_UFC_FAVOURITE
    ? stats.byFavouriteBucket.get(favouriteBucketLabel)
    : model === MODEL_UFC_OTHER
      ? stats.byOtherBucket.get(otherBucketLabel)
      : stats.byDifferenceBucket.get(differenceBucketLabel);
  const bucketLabel = model === MODEL_UFC_FAVOURITE
    ? favouriteBucketLabel
    : model === MODEL_UFC_OTHER
      ? otherBucketLabel
      : differenceBucketLabel;

  return {
    bucket,
    bucketLabel,
    bucketSampleSize: bucket?.selections ?? 0,
    fixedWinPrice: Number(row.favourite_price),
    otherFixedWinPrice: Number(row.other_fighter_price),
    otherParticipantName: row.other_fighter_name,
    outcomeResultPosition: row.favourite_won ? 1 : 2,
    outcomeWinReturn: row.favourite_won ? Number(row.favourite_price) : 0,
    participantName: row.favourite_name,
    priceDifference: Number(row.price_difference),
    raw: row,
    sourceEntryId: row.source_fight_key,
    title: `${row.favourite_name} vs ${row.other_fighter_name}`,
    winScore: bucket?.winPercentage ?? null,
  };
}

function createRacingRecommendation(date, model, candidates) {
  const threshold = model === MODEL_60_PLUS ? 60 : model === MODEL_65_PLUS ? 65 : null;
  const maxLegs = threshold ? 10 : 5;
  const eligible = threshold
    ? candidates.filter((candidate) => candidate.winScore >= threshold)
    : getOriginalEligibleCandidates(candidates);

  return createRecommendation({
    candidates: eligible,
    groupKey: "racing:all",
    groupName: "Racing all eligible races",
    maxLegs,
    model,
    sourceDate: date,
    sport: "racing",
  });
}

function createUfcRecommendation(date, groupKey, model, candidates) {
  return createRecommendation({
    candidates: candidates.filter((candidate) => candidate.winScore >= 40),
    groupKey,
    groupName: groupKey.split(":").slice(1).join(":") || "UFC card",
    maxLegs: 8,
    model,
    sourceDate: date,
    sport: "ufc",
  });
}

function getOriginalEligibleCandidates(candidates) {
  const positive = candidates.filter((candidate) => candidate.winScore >= 50);

  if (positive.length >= 3) {
    return positive;
  }

  return candidates.filter((candidate) => candidate.winScore >= 40);
}

function createRecommendation({ candidates, groupKey, groupName, maxLegs, model, sourceDate, sport }) {
  if (candidates.length < 3) {
    return null;
  }

  const legs = candidates.slice(0, maxLegs);
  const combinedFixedWinPrice = legs.reduce((total, leg) => total * leg.fixedWinPrice, 1);
  const averageWinScore = legs.reduce((total, leg) => total + leg.winScore, 0) / legs.length;
  const winningLegCount = legs.filter((leg) => leg.outcomeWinReturn > 0).length;
  const missingResultCount = legs.filter((leg) => !Number.isFinite(leg.outcomeResultPosition)).length;
  const recommendationType = legs.every((leg) => leg.winScore >= 50) ? "positive" : "neutral";

  return {
    legs,
    recommendation: {
      average_win_score: round(averageWinScore, 4),
      combined_fixed_win_price: round(combinedFixedWinPrice, 4),
      group_key: groupKey,
      group_name: groupName,
      leg_count: legs.length,
      model_data_cutoff_date: offsetDate(sourceDate, -1),
      outcome_missing_result_count: missingResultCount,
      outcome_settled_leg_count: legs.length - missingResultCount,
      outcome_status: missingResultCount ? "missing_result" : "settled",
      outcome_win_return: missingResultCount ? 0 : winningLegCount === legs.length ? round(combinedFixedWinPrice, 4) : 0,
      outcome_winning_leg_count: winningLegCount,
      prediction_model: model,
      raw: {
        note: "Generated historical backtest. The model uses only rows before source_date.",
      },
      recommendation_type: recommendationType,
      source: "historical_backtest",
      source_date: sourceDate,
      source_time_zone: SOURCE_TIME_ZONE,
      sport,
    },
  };
}

function mapLegRows(recommendationId, legs) {
  return legs.map((leg, index) => {
    const signal = createSignal(leg.winScore, leg.bucketSampleSize);

    return {
      advertised_start: leg.raw.advertised_start ?? null,
      bucket_label: leg.bucketLabel,
      bucket_sample_size: leg.bucketSampleSize,
      bucket_win_percentage: leg.bucket?.winPercentage ?? null,
      fixed_win_price: leg.fixedWinPrice,
      leg_index: index + 1,
      other_fixed_win_price: leg.otherFixedWinPrice ?? null,
      other_participant_name: leg.otherParticipantName ?? null,
      outcome_result_position: Number.isFinite(leg.outcomeResultPosition) ? leg.outcomeResultPosition : null,
      outcome_status: Number.isFinite(leg.outcomeResultPosition) ? "settled" : "missing_result",
      outcome_win_return: leg.outcomeWinReturn,
      participant_name: leg.participantName,
      participant_number: leg.participantNumber ?? null,
      prediction_rank: leg.predictionRank,
      price_difference: leg.priceDifference ?? null,
      raw: leg.raw,
      recommendation_id: recommendationId,
      signal_label: signal.label,
      signal_tone: signal.tone,
      source_entry_id: leg.sourceEntryId,
      title: leg.title,
      win_score: round(leg.winScore, 4),
    };
  });
}

function createSignal(score, sampleSize) {
  if (sampleSize < 10) {
    return {
      label: "Small historical sample",
      tone: "neutral",
    };
  }

  if (score >= 50) {
    return {
      label: "Positive historical win-rate signal",
      tone: "positive",
    };
  }

  return {
    label: "Neutral historical win-rate signal",
    tone: "neutral",
  };
}

function compareCandidates(left, right) {
  if (right.winScore !== left.winScore) {
    return right.winScore - left.winScore;
  }

  return String(left.raw.advertised_start ?? left.sourceEntryId)
    .localeCompare(String(right.raw.advertised_start ?? right.sourceEntryId));
}

function weightedAverage(parts) {
  const usable = parts.filter((part) => Number.isFinite(Number(part.value)));
  const totalWeight = usable.reduce((total, part) => total + part.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return usable.reduce((total, part) => total + (Number(part.value) * part.weight), 0) / totalWeight;
}

function getPriceBucketStart(price) {
  return 1 + Math.floor(Math.max(0, price - 1) / 0.5) * 0.5;
}

function getPriceDifferenceBucketStart(priceDifference) {
  return Math.floor(Math.max(0, priceDifference) / 0.5) * 0.5;
}

function createPriceBucketLabel(start) {
  return `$${start.toFixed(2)} - $${(start + 0.49).toFixed(2)}`;
}

function groupBy(rows, getKey) {
  const groups = new Map();

  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
}

function unique(values) {
  return Array.from(new Set(values));
}

function chunkRows(rows, size) {
  const chunks = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function offsetDate(value, offsetDays) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + (offsetDays * 86400000)).toISOString().slice(0, 10);
}

function round(value, places) {
  return Number(Number(value).toFixed(places));
}

async function rebuildSport(config, sport, options) {
  const recommendations = sport === "racing"
    ? buildRacingBacktests(await selectAll(config, "race_day_entries", {
      order: "meeting_date.asc,advertised_start.asc",
      select: [
        "advertised_start",
        "country",
        "course_name",
        "favourite_price",
        "favourite_result_position",
        "favourite_runner_name",
        "meeting_date",
        "race_code",
        "race_id",
        "race_name",
        "race_number",
        "starter_count",
      ].join(","),
    }), options.fromDate, options.toDate)
    : buildUfcBacktests(await selectAll(config, "ufc_fight_entries", {
      included_in_insights: "eq.true",
      order: "event_date.asc,event_name.asc",
      select: [
        "event_date",
        "event_name",
        "favourite_name",
        "favourite_price",
        "favourite_won",
        "id",
        "included_in_insights",
        "other_fighter_name",
        "other_fighter_price",
        "price_difference",
        "source_fight_key",
      ].join(","),
    }), options.fromDate, options.toDate);

  await deleteExistingBacktests(config, sport, options.fromDate, options.toDate);

  const inserted = await insertRecommendations(config, recommendations.map((entry) => entry.recommendation));
  const insertedByKey = new Map(inserted.map((row) => [createRecommendationKey(row), row.id]));
  const legRows = recommendations.flatMap((entry) => {
    const id = insertedByKey.get(createRecommendationKey(entry.recommendation));

    return id ? mapLegRows(id, entry.legs) : [];
  });

  await insertLegs(config, legRows);

  return {
    legs: legRows.length,
    recommendations: inserted.length,
    sport,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase URL or server-side key is not configured.");
    }

    console.log(JSON.stringify({ skipped: true, reason: "Supabase write config missing." }, null, 2));
    return;
  }

  const sports = options.sport === "all" ? ["racing", "ufc"] : [options.sport];
  const results = [];

  for (const sport of sports) {
    results.push(await rebuildSport(config, sport, options));
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

function createRecommendationKey(row) {
  return [
    row.sport,
    row.prediction_model,
    row.source,
    row.source_date,
    row.group_key,
    row.recommendation_type,
  ].join(":");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
