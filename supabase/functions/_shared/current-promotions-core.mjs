const FIXED_WIN_PRODUCT_TYPE_ID = "940b8704-e497-4a76-b390-00918ff7d282";
const FIXED_WIN_PRICE_ID_PATTERNS = [
  `:${FIXED_WIN_PRODUCT_TYPE_ID}:`,
  ":1f48974a-7307-4408-8f06-8a16907d1309:18ba60da-abd2-463c-a34a-dc6368377ac8",
];
const BET_BACK_CANDIDATES_PER_COUNTRY_DISCIPLINE = 5;
const DEFAULT_PREDICTION_MODEL_KEY = "global_bucket_blend_v1";
const CASH_ONLY_PREDICTION_MODEL_KEY = "global_bucket_cash_blend_v1";
const CASH_EVEN_PREDICTION_MODEL_KEY = "global_bucket_cash_even_blend_v1";
const CASH_PRICE_ONLY_PREDICTION_MODEL_KEY = "global_bucket_cash_price_only_v1";
const CASH_STARTER_ONLY_PREDICTION_MODEL_KEY = "global_bucket_cash_starter_only_v1";
const OTHER_STARTERS_AVERAGE_PRICE_MODEL_KEY = "global_other_starters_average_price_cash_v1";
const SCOPED_PREDICTION_MODEL_KEY = "country_code_bucket_blend_shrunk_v1";
const DISTANCE_CONDITION_PREDICTION_MODEL_KEY = "country_code_distance_condition_v1";
const SCOPED_MODEL_MIN_SAMPLE = 100;
const OTHER_STARTER_PRICE_OUTLIER_CUTOFF = 70;
export const SOURCE_TIME_ZONE = "Pacific/Auckland";

export const PREDICTION_MODELS = [
  {
    description: "Scores each current favourite using all-country historical cash averages for the matching favourite price bucket and final-starter-count bucket, with cash-plus-bonus retained as supporting context.",
    key: DEFAULT_PREDICTION_MODEL_KEY,
    label: "Global bucket blend",
  },
  {
    description: "Scores each current favourite using all-country historical cash averages for the matching favourite price bucket and final-starter-count bucket, excluding bonus-credit value.",
    key: CASH_ONLY_PREDICTION_MODEL_KEY,
    label: "Global cash bucket blend",
  },
  {
    description: "Scores each current favourite using equal-weight all-country historical cash averages for the matching favourite price bucket and final-starter-count bucket, excluding bonus-credit value.",
    key: CASH_EVEN_PREDICTION_MODEL_KEY,
    label: "Global cash 50/50 blend",
  },
  {
    description: "Scores each current favourite using only the all-country historical cash average for the matching favourite price bucket, excluding bonus-credit value.",
    key: CASH_PRICE_ONLY_PREDICTION_MODEL_KEY,
    label: "Global cash price only",
  },
  {
    description: "Scores each current favourite using only the all-country historical cash average for the matching final-starter-count bucket, excluding bonus-credit value.",
    key: CASH_STARTER_ONLY_PREDICTION_MODEL_KEY,
    label: "Global cash starters only",
  },
  {
    description: "Scores each current favourite using all-country historical cash averages for the matching average fixed-win price bucket of the other starters, excluding other-starter prices at $70.00 or above.",
    key: OTHER_STARTERS_AVERAGE_PRICE_MODEL_KEY,
    label: "Other starters avg price",
  },
  {
    description: "Scores each current favourite using country-and-discipline historical cash buckets when available, blended back toward global buckets so small samples do not dominate.",
    key: SCOPED_PREDICTION_MODEL_KEY,
    label: "Country + discipline blend",
  },
  {
    description: "Scores each current favourite using country-and-discipline cash buckets for price, starter, distance-band, and track-condition signals with conservative shrinkage toward broader history.",
    key: DISTANCE_CONDITION_PREDICTION_MODEL_KEY,
    label: "Distance + condition blend",
  },
];

/**
 * Creates a configured Australian comparison track entry for current-race scanning.
 */
function australianComparisonTrack(canonicalName, aliases = [canonicalName]) {
  return {
    aliases: aliases.map((alias) => normalizeName(alias)),
    canonicalName,
    country: "AUS",
  };
}

const TARGET_BET_BACK_TRACKS = [
  {
    aliases: ["ellerslie"],
    canonicalName: "Ellerslie",
    country: "NZ",
  },
  {
    aliases: ["new plymouth", "new plymouth raceway", "pukekura raceway"],
    canonicalName: "New Plymouth",
    country: "NZ",
  },
  {
    aliases: ["te rapa"],
    canonicalName: "Te Rapa",
    country: "NZ",
  },
  {
    aliases: ["addington", "addington raceway"],
    canonicalName: "Addington",
    country: "NZ",
  },
  {
    aliases: ["alexandra park", "auckland"],
    canonicalName: "Alexandra Park",
    country: "NZ",
  },
  {
    aliases: ["wingatui"],
    canonicalName: "Wingatui",
    country: "NZ",
  },
  {
    aliases: ["whanganui", "wanganui", "hatrick", "whanganui straight", "hatrick straight"],
    canonicalName: "Whanganui",
    country: "NZ",
  },
  {
    aliases: ["cambridge", "cambridge raceway", "cambridge g", "cambridge synthetic"],
    canonicalName: "Cambridge",
    country: "NZ",
  },
  australianComparisonTrack("Ascot"),
  australianComparisonTrack("Sunshine Coast"),
  australianComparisonTrack("Ipswich"),
  australianComparisonTrack("Eagle Farm"),
  australianComparisonTrack("Pakenham"),
  australianComparisonTrack("Doomben"),
  australianComparisonTrack("Morphettville"),
  australianComparisonTrack("Newcastle"),
  australianComparisonTrack("Gold Coast"),
  australianComparisonTrack("Toowoomba"),
  australianComparisonTrack("Townsville"),
  australianComparisonTrack("Cranbourne"),
  australianComparisonTrack("Albion Park"),
  australianComparisonTrack("Redcliffe"),
  australianComparisonTrack("Globe Derby"),
  australianComparisonTrack("Gloucester Park"),
  australianComparisonTrack("Menangle"),
  australianComparisonTrack("Melton"),
  australianComparisonTrack("Bathurst"),
  australianComparisonTrack("Pinjarra"),
  australianComparisonTrack("Penrith"),
  australianComparisonTrack("Shepparton"),
  australianComparisonTrack("Mildura"),
  australianComparisonTrack("Q1 Lakeside"),
  australianComparisonTrack("Mandurah"),
  australianComparisonTrack("Angle Park"),
  australianComparisonTrack("Richmond"),
  australianComparisonTrack("Healesville"),
  australianComparisonTrack("Warragul"),
  australianComparisonTrack("The Gardens"),
  australianComparisonTrack("Ballarat"),
  australianComparisonTrack("Geelong"),
  australianComparisonTrack("Taree"),
  australianComparisonTrack("Q Straight"),
  australianComparisonTrack("Q2 Parklands"),
  australianComparisonTrack("Nowra"),
  australianComparisonTrack("Warrnambool"),
];

const SOURCES = [
  {
    label: "Betcha",
    source: "betcha",
    endpoint: "https://api.betcha.co.nz/graphql",
  },
  {
    label: "TAB",
    source: "tab",
    endpoint: "https://api.tab.co.nz/graphql",
  },
];

const PROMOTIONS_QUERY = `
  query PromotionsList(
    $after: String
    $first: Int
    $subdivision: Subdivision
    $eligibility: [PromotionEligibility!]
    $walletType: WalletType
  ) {
    promotions(
      after: $after
      first: $first
      includeExpired: false
      subdivision: $subdivision
      eligibilities: $eligibility
      availableOn: DESKTOP_ONLY
      walletType: $walletType
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        id
        image(type: TILE)
        uri
        buttonText
        termsAndConditions
        description
        claimCode
        expiry
        rootCategoryGroup
      }
    }
  }
`;

const RACING_DAY_QUERY = `
  query RacingHomeMeetingsDesktopScreen(
    $date: Date!
    $categories: [RacingCategory!]
    $regions: [Region!]
  ) {
    racingDay(date: $date, categories: $categories, regions: $regions) {
      meetings: nodes {
        id
        name
        category
        meetingCode
        venue {
          name
          country
          state
        }
        races: racesConnection {
          nodes {
            id
            name
            number
            advertisedStart
            finalFieldMarket {
              id
              status
            }
            resultsSummary
          }
        }
      }
    }
  }
`;

const RACE_CARD_QUERY = `
  query RaceCardLite($id: ID!) {
    raceCard: node(id: $id) {
      __typename
      ... on RacingRaceCard {
        id
        name
        number
        status
        advertisedStart
        distance
        trackCondition
        finalField(baseAvailability: true) {
          runnerRows(baseAvailability: true) {
            id
            number
            name
            scratchedTimestamp
            isMarketMover
            prices(baseAvailability: true) {
              id
              odds {
                decimal
                numerator
                denominator
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Accepts either the project URL or a copied REST URL and returns the project origin.
 */
export function normalizeSupabaseProjectUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return String(value).replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

/**
 * Converts a generated promotions payload into the cache table row shape.
 */
export function createPromotionSnapshotRow(output) {
  return {
    generated_at: output.generatedAt,
    generated_at_nz: output.generatedAtNz,
    payload: output,
    source_date: output.sourceDate,
    source_time_zone: output.sourceTimeZone ?? SOURCE_TIME_ZONE,
    summary: output.summary,
  };
}

/**
 * Upserts the generated current-promotions payload into the Supabase cache table.
 */
export async function upsertPromotionSnapshotToSupabase({ output, supabaseKey, supabaseUrl }) {
  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      skipped: true,
      reason: "Supabase URL or server-side key is not configured.",
    };
  }

  const row = createPromotionSnapshotRow(output);
  const normalizedUrl = normalizeSupabaseProjectUrl(supabaseUrl);
  const response = await fetch(
    `${normalizedUrl}/rest/v1/current_promotion_snapshots?on_conflict=source_date,source_time_zone`,
    {
      body: JSON.stringify(row),
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase current_promotion_snapshots upsert failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return {
    ok: true,
    skipped: false,
  };
}

/**
 * Stores the current prediction payload in its own cache table, separate from promotions.
 */
export async function upsertPredictionSnapshotToSupabase({ output, supabaseKey, supabaseUrl }) {
  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      skipped: true,
    };
  }

  const normalizedUrl = normalizeSupabaseProjectUrl(supabaseUrl);
  const response = await fetch(
    `${normalizedUrl}/rest/v1/current_prediction_snapshots?on_conflict=source_date,source_time_zone`,
    {
      body: JSON.stringify({
        generated_at: output.generatedAt,
        generated_at_nz: output.generatedAtNz ?? null,
        payload: output,
        source_date: output.sourceDate,
        source_time_zone: output.sourceTimeZone ?? SOURCE_TIME_ZONE,
        summary: output.summary,
      }),
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase current_prediction_snapshots upsert failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return {
    ok: true,
    skipped: false,
  };
}

function createPredictionSignature(candidate, modelKey = DEFAULT_PREDICTION_MODEL_KEY) {
  return JSON.stringify({
    blendedCashPlusBonusAverage: candidate.candidate?.blendedCashPlusBonusAverage ?? null,
    cashAverageScore: candidate.candidate?.cashAverageScore ?? null,
    favouriteFixedWinPrice: candidate.favourite?.fixedWinPrice ?? null,
    favouriteName: candidate.favourite?.name ?? null,
    favouriteNumber: candidate.favourite?.number ?? null,
    modelKey,
    otherStartersAverageFixedWinPrice: candidate.fieldPriceShape?.otherStartersAverageFixedWinPrice ?? null,
    rank: candidate.rank ?? null,
    signalLabel: candidate.candidate?.label ?? null,
    starters: candidate.starters ?? null,
  });
}

function createPredictionRowsFromPayload(output) {
  const modelRuns = output.betBackCandidates?.models?.length
    ? output.betBackCandidates.models
    : [{
        candidates: output.betBackCandidates?.candidates ?? [],
        key: DEFAULT_PREDICTION_MODEL_KEY,
      }];

  return modelRuns.flatMap((model) => (model.candidates ?? []).map((candidate) => ({
    advertised_start: candidate.advertisedStart,
    blended_cash_plus_bonus_average: candidate.candidate?.blendedCashPlusBonusAverage ?? null,
    cash_average_score: candidate.candidate?.cashAverageScore ?? null,
    canonical_track: candidate.canonicalTrack ?? null,
    country: candidate.country ?? null,
    course_name: candidate.canonicalTrack ?? candidate.sourceTrack ?? null,
    course_slug: candidate.canonicalTrack ? toSlug(candidate.canonicalTrack) : null,
    historical_sample_size: candidate.candidate?.sampleSize ?? 0,
    prediction_model: model.key ?? DEFAULT_PREDICTION_MODEL_KEY,
    predicted_at: output.generatedAt,
    predicted_fixed_win_price: candidate.favourite?.fixedWinPrice ?? null,
    predicted_other_starters_average_fixed_win_price: candidate.fieldPriceShape?.otherStartersAverageFixedWinPrice ?? null,
    predicted_other_starters_price_count: candidate.fieldPriceShape?.otherStartersPriceCount ?? null,
    predicted_other_starters_price_outlier_count: candidate.fieldPriceShape?.otherStartersPriceOutlierCount ?? null,
    predicted_implied_win_percentage: candidate.favourite?.impliedWinPercentage ?? null,
    predicted_runner_name: candidate.favourite?.name ?? null,
    predicted_runner_number: candidate.favourite?.number ?? null,
    predicted_starter_count: candidate.starters ?? null,
    prediction_signature: createPredictionSignature(candidate, model.key ?? DEFAULT_PREDICTION_MODEL_KEY),
    price_bucket_label: candidate.historical?.priceBucket?.label ?? candidate.favourite?.priceBucket ?? null,
    race_code: candidate.code,
    race_name: candidate.raceName,
    race_number: candidate.raceNumber,
    rank: candidate.rank ?? null,
    raw: candidate,
    signal_detail: candidate.candidate?.detail ?? null,
    signal_label: candidate.candidate?.label ?? null,
    signal_tone: candidate.candidate?.tone ?? null,
    source: output.betBackCandidates?.source ?? "betcha",
    source_date: output.sourceDate,
    source_race_card_id: candidate.raceCardId,
    source_time_zone: output.sourceTimeZone ?? SOURCE_TIME_ZONE,
    source_track: candidate.sourceTrack ?? candidate.track ?? null,
    starter_bucket_label: candidate.historical?.starterBucket?.label ?? null,
  })));
}

async function fetchExistingPredictionSignatures({ rows, supabaseKey, supabaseUrl }) {
  if (!rows.length) {
    return new Map();
  }

  const normalizedUrl = normalizeSupabaseProjectUrl(supabaseUrl);
  const ids = rows.map((row) => `"${escapePostgrestInValue(row.source_race_card_id)}"`).join(",");
  const url = new URL("/rest/v1/promotion_predictions", normalizedUrl);
  url.searchParams.set("select", "prediction_model,source,source_race_card_id,prediction_signature");
  url.searchParams.set("source", `eq.${rows[0].source}`);
  url.searchParams.set("source_race_card_id", `in.(${ids})`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase promotion_predictions read failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  const existingRows = await response.json();

  return new Map(existingRows.map((row) => [
    `${row.prediction_model ?? DEFAULT_PREDICTION_MODEL_KEY}:${row.source}:${row.source_race_card_id}`,
    row.prediction_signature,
  ]));
}

/**
 * Stores Betcha candidate predictions once per model and source race card, replacing only changed predictions.
 */
export async function upsertPromotionPredictionsToSupabase({ output, supabaseKey, supabaseUrl }) {
  if (!supabaseUrl || !supabaseKey) {
    return {
      changed: 0,
      ok: false,
      skipped: true,
      total: 0,
    };
  }

  if (isPredictionWindowClosed(output)) {
    return {
      changed: 0,
      ok: true,
      reason: "Prediction window is closed because the first eligible race has started.",
      skipped: true,
      total: 0,
    };
  }

  const rows = createPredictionRowsFromPayload(output);

  if (!rows.length) {
    return {
      changed: 0,
      ok: true,
      skipped: false,
      total: 0,
    };
  }

  const existing = await fetchExistingPredictionSignatures({ rows, supabaseKey, supabaseUrl });
  const changedRows = rows.filter((row) =>
    existing.get(`${row.prediction_model}:${row.source}:${row.source_race_card_id}`) !== row.prediction_signature);

  if (!changedRows.length) {
    return {
      changed: 0,
      ok: true,
      skipped: false,
      total: rows.length,
    };
  }

  const normalizedUrl = normalizeSupabaseProjectUrl(supabaseUrl);
  const response = await fetch(
    `${normalizedUrl}/rest/v1/promotion_predictions?on_conflict=prediction_model,source,source_race_card_id`,
    {
      body: JSON.stringify(changedRows),
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase promotion_predictions upsert failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return {
    changed: changedRows.length,
    ok: true,
    skipped: false,
    total: rows.length,
  };
}

/**
 * Reads the current racing date in Auckland so local previews do not drift on UTC.
 */
export function getTodayNzDate() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatNzDateTimeOrNull(value) {
  return value ? formatNzDateTime(new Date(value)) : null;
}

function getEarliestIsoDate(values) {
  const timestamps = values
    .map((value) => new Date(value).valueOf())
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.min(...timestamps)).toISOString();
}

/**
 * Decides whether a prediction refresh is still allowed to create stored rows.
 */
export function createPredictionWindowStatus({ firstRaceStart, generatedAt }) {
  const firstRaceStartTime = firstRaceStart ? new Date(firstRaceStart).valueOf() : null;
  const generatedAtTime = new Date(generatedAt).valueOf();
  const isClosed = Number.isFinite(firstRaceStartTime) && generatedAtTime >= firstRaceStartTime;

  return {
    firstRaceStart,
    firstRaceStartNz: formatNzDateTimeOrNull(firstRaceStart),
    generatedBeforeFirstRace: !isClosed,
    isClosed,
    skippedReason: isClosed ? "first_race_started" : null,
    status: isClosed ? "closed" : "open",
  };
}

export function isPredictionWindowClosed(output) {
  if (output?.predictionWindow) {
    return output.predictionWindow.isClosed === true;
  }

  if (!output?.generatedAt) {
    return false;
  }

  return createPredictionWindowStatus({
    firstRaceStart: output.betBackCandidates?.firstEligibleRaceStart ?? null,
    generatedAt: output.generatedAt,
  }).isClosed;
}

/**
 * Formats a timestamp in the racing source timezone for human-facing fixture metadata.
 */
function formatNzDateTime(value) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    timeZoneName: "short",
    year: "numeric",
  }).format(value);
}

/**
 * Converts a race start timestamp to its Auckland calendar date for racingDay lookups.
 */
function getNzDateFromIso(value) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function toRaceCardId(id) {
  return String(id).replace(/^RacingRace:/, "RacingRaceCard:");
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value ?? "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function toSlug(value) {
  return normalizeName(value).replace(/\s+/g, "-");
}

function escapePostgrestInValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function toRaceCode(category) {
  const mapping = {
    GREYHOUND: "greyhound",
    HARNESS: "harness",
    HORSE: "horse",
  };

  return mapping[category] ?? String(category ?? "").toLowerCase();
}

function extractUuidFromRacingUri(uri) {
  const match = String(uri ?? "").match(/\/racing\/[^/]+\/([0-9a-f-]{36})(?:$|[/?#])/i);
  return match?.[1] ?? null;
}

function extractRaceRange(description) {
  const rangeMatch = String(description ?? "").match(/\bRaces?\s+(\d+)\s*-\s*(\d+)\b/i);
  if (rangeMatch) {
    const from = Number(rangeMatch[1]);
    const to = Number(rangeMatch[2]);

    if (Number.isFinite(from) && Number.isFinite(to)) {
      return { from: Math.min(from, to), to: Math.max(from, to) };
    }
  }

  const singleMatch = String(description ?? "").match(/\bRace\s+(\d+)\b/i);
  if (singleMatch) {
    const raceNumber = Number(singleMatch[1]);

    if (Number.isFinite(raceNumber)) {
      return { from: raceNumber, to: raceNumber };
    }
  }

  return null;
}

function extractTargetRunnerNumber(description) {
  const match = String(description ?? "").match(/#\s*(\d+)/);
  const number = Number(match?.[1]);
  return Number.isFinite(number) ? number : null;
}

function isRacingPromotion(promotion) {
  const rootCategoryGroups = Array.isArray(promotion.rootCategoryGroup)
    ? promotion.rootCategoryGroup
    : [promotion.rootCategoryGroup].filter(Boolean);
  const description = String(promotion.description ?? "");
  const uri = String(promotion.uri ?? "");
  const hasRacingCategory = rootCategoryGroups.includes("RACING");
  const racingText = uri.startsWith("/racing")
    || /\b(thoroughbreds?|harness|greyhounds?|races?|racing|trackside|easy\s*form|easybet|before the jump)\b/i.test(
      description,
    );
  const genericAccountPromo = /^\/(?:account|signup)(?:$|[/?#])/i.test(uri)
    || /\b(safer betting|gambling helpline|withdrawals?|sign\s*up|signup|sports markets)\b/i.test(
      description,
    );

  if (genericAccountPromo && !racingText) {
    return false;
  }

  return racingText || (hasRacingCategory && rootCategoryGroups.length === 1);
}

function mapPromotionSummary(source, promotion) {
  return {
    buttonText: promotion.buttonText ?? null,
    description: promotion.description,
    expiry: promotion.expiry,
    id: promotion.id,
    provider: source.label,
    providerKey: source.source,
    rootCategoryGroup: promotion.rootCategoryGroup,
    uri: promotion.uri,
  };
}

function dedupePromotionsByContent(promotions) {
  const seen = new Set();
  const deduped = [];

  for (const promotion of promotions) {
    const key = [
      normalizeName(promotion.description),
      String(promotion.uri ?? ""),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(promotion);
  }

  return deduped;
}

function createPriceBucketLabel(start) {
  return `$${start.toFixed(2)} - $${(start + 0.49).toFixed(2)}`;
}

function getPriceBucketStart(price) {
  return 1 + Math.floor(Math.max(0, price - 1) / 0.5) * 0.5;
}

function createOtherStartersAveragePriceBucketLabel(start) {
  if (start >= 25) {
    return "$25.00+";
  }

  return `$${start.toFixed(2)} - $${(start + 2.99).toFixed(2)}`;
}

function getOtherStartersAveragePriceBucketStart(price) {
  const normalizedPrice = Number(price);

  if (!Number.isFinite(normalizedPrice)) {
    return null;
  }

  if (normalizedPrice < 3) {
    return 0;
  }

  if (normalizedPrice < 5) {
    return 3;
  }

  if (normalizedPrice < 7) {
    return 5;
  }

  if (normalizedPrice < 10) {
    return 7;
  }

  if (normalizedPrice < 15) {
    return 10;
  }

  if (normalizedPrice < 25) {
    return 15;
  }

  return 25;
}

function createOtherStartersAveragePriceBucket(value) {
  const bucketStart = getOtherStartersAveragePriceBucketStart(value);

  if (bucketStart === null) {
    return null;
  }

  return {
    label: createOtherStartersAveragePriceBucketLabel(bucketStart),
    start: bucketStart,
  };
}

function createStatsBucket(label) {
  return {
    averageReturnPerDollar: 0,
    averageValuePerDollarWithBonusCredit: 0,
    bonusBetCreditPercentage: 0,
    bonusBetCredits: 0,
    favouriteSelections: 0,
    label,
    profitLoss: 0,
    profitLossWithBonusCredit: 0,
    secondPercentage: 0,
    seconds: 0,
    thirdPercentage: 0,
    thirds: 0,
    totalBonusBetCredit: 0,
    totalReturn: 0,
    totalStake: 0,
    totalValueWithBonusCredit: 0,
    winPercentage: 0,
    wins: 0,
  };
}

/**
 * Applies AU/NZ/HK place-style bet-back terms from the final starter count.
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
 * Adds a settled favourite into historical promotion signal stats.
 */
function addFavouriteToStats(bucket, favourite, starterCount) {
  const winReturn = favourite.resultPosition === 1 ? favourite.fixedWinPrice : 0;
  const bonusBetCredit = getBonusBetCredit(favourite.resultPosition, starterCount);

  bucket.favouriteSelections += 1;
  bucket.totalStake += 1;
  bucket.totalReturn += winReturn;
  bucket.totalBonusBetCredit += bonusBetCredit;
  bucket.totalValueWithBonusCredit += winReturn + bonusBetCredit;
  bucket.wins += favourite.resultPosition === 1 ? 1 : 0;
  bucket.seconds += favourite.resultPosition === 2 ? 1 : 0;
  bucket.thirds += favourite.resultPosition === 3 ? 1 : 0;
  bucket.bonusBetCredits += bonusBetCredit > 0 ? 1 : 0;
}

function finalizeStatsBucket(bucket) {
  return {
    ...bucket,
    averageReturnPerDollar: bucket.totalStake
      ? Number((bucket.totalReturn / bucket.totalStake).toFixed(3))
      : 0,
    averageValuePerDollarWithBonusCredit: bucket.totalStake
      ? Number((bucket.totalValueWithBonusCredit / bucket.totalStake).toFixed(3))
      : 0,
    bonusBetCreditPercentage: bucket.favouriteSelections
      ? Number(((bucket.bonusBetCredits / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    profitLoss: Number((bucket.totalReturn - bucket.totalStake).toFixed(2)),
    profitLossWithBonusCredit: Number(
      (bucket.totalValueWithBonusCredit - bucket.totalStake).toFixed(2),
    ),
    secondPercentage: bucket.favouriteSelections
      ? Number(((bucket.seconds / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    thirdPercentage: bucket.favouriteSelections
      ? Number(((bucket.thirds / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    totalBonusBetCredit: Number(bucket.totalBonusBetCredit.toFixed(2)),
    totalReturn: Number(bucket.totalReturn.toFixed(2)),
    totalStake: Number(bucket.totalStake.toFixed(2)),
    totalValueWithBonusCredit: Number(bucket.totalValueWithBonusCredit.toFixed(2)),
    winPercentage: bucket.favouriteSelections
      ? Number(((bucket.wins / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
  };
}

function createHistoricalStatsContainer(basisLabel, fixtureCount) {
  return {
    byDistanceBand: {},
    byOtherStartersAveragePriceBucket: {},
    byPriceBucket: {},
    byStarterCount: {},
    byTrackConditionGroup: {},
    basisLabel,
    fixtureCount,
    scopes: {},
  };
}

function getHistoricalScope(stats, scopeKey) {
  const scope = stats.scopes[scopeKey] ?? {
    byDistanceBand: new Map(),
    byOtherStartersAveragePriceBucket: new Map(),
    byPriceBucket: new Map(),
    byStarterCount: new Map(),
    byTrackConditionGroup: new Map(),
  };

  stats.scopes[scopeKey] = scope;

  return scope;
}

function addStatsBucketToScope(scope, type, label, favourite, starterCount) {
  const bucketMap = type === "starter_count"
    ? scope.byStarterCount
    : type === "distance_band"
      ? scope.byDistanceBand
      : type === "track_condition"
        ? scope.byTrackConditionGroup
        : type === "other_starters_average_price_bucket"
          ? scope.byOtherStartersAveragePriceBucket
          : scope.byPriceBucket;
  const bucket = bucketMap.get(label) ?? createStatsBucket(label);

  addFavouriteToStats(bucket, favourite, starterCount);
  bucketMap.set(label, bucket);
}

function getDistanceBand(distance) {
  const normalizedDistance = Number(distance);

  if (!Number.isFinite(normalizedDistance)) {
    return null;
  }

  if (normalizedDistance <= 350) {
    return "<=350m";
  }

  if (normalizedDistance <= 500) {
    return "351-500m";
  }

  if (normalizedDistance <= 800) {
    return "501-800m";
  }

  if (normalizedDistance <= 1200) {
    return "801-1200m";
  }

  if (normalizedDistance <= 1600) {
    return "1201-1600m";
  }

  if (normalizedDistance <= 2200) {
    return "1601-2200m";
  }

  return "2201m+";
}

function getTrackConditionGroup(trackCondition) {
  const normalizedCondition = normalizeName(trackCondition);

  if (!normalizedCondition) {
    return null;
  }

  if (normalizedCondition.includes("heavy")) {
    return "heavy";
  }

  if (
    normalizedCondition.includes("soft")
    || normalizedCondition.includes("slow")
    || normalizedCondition.includes("dead")
    || normalizedCondition.includes("easy")
    || normalizedCondition.includes("slushy")
  ) {
    return "soft/slow";
  }

  if (
    normalizedCondition.includes("good")
    || normalizedCondition.includes("fast")
    || normalizedCondition.includes("firm")
  ) {
    return "good/fast";
  }

  if (normalizedCondition.includes("synthetic")) {
    return "synthetic";
  }

  return normalizedCondition;
}

function finalizeBucketMap(bucketMap) {
  return Object.fromEntries(Array.from(bucketMap.entries()).map(([key, bucket]) => [
    key,
    finalizeStatsBucket(bucket),
  ]));
}

/**
 * Sends public GraphQL requests with the browser headers current source gateways expect.
 */
function getGraphqlHeaders(source) {
  const origin = source.source === "betcha"
    ? "https://www.betcha.co.nz"
    : "https://www.tab.co.nz";

  return {
    accept: "application/json",
    "accept-language": "en-NZ,en;q=0.9",
    "content-type": "application/json",
    origin,
    referer: `${origin}/`,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
}

async function graphql(source, operationName, query, variables) {
  const response = await fetch(source.endpoint, {
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
    headers: getGraphqlHeaders(source),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${source.label} ${operationName} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    const messages = payload.errors.map((error) => error.message).join("; ");
    throw new Error(`${source.label} ${operationName} returned GraphQL errors: ${messages}`);
  }

  return payload;
}

async function fetchAllPromotions(source) {
  const promotions = [];
  const seenPromotionIds = new Set();
  let after = null;
  let pageCount = 0;

  do {
    pageCount += 1;
    const response = await graphql(source, "PromotionsList", PROMOTIONS_QUERY, {
      after,
      eligibility: null,
      first: 100,
      subdivision: null,
      walletType: null,
    });
    const connection = response.data?.promotions;

    for (const promotion of connection?.nodes ?? []) {
      if (seenPromotionIds.has(promotion.id)) {
        continue;
      }

      seenPromotionIds.add(promotion.id);
      promotions.push(promotion);
    }

    after = connection?.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after);

  return {
    pageCount,
    promotions,
  };
}

/**
 * Builds promotion-signal buckets from historical race-day fixture payloads.
 */
export function createHistoricalStatsFromFixtures(fixtures) {
  const stats = createHistoricalStatsContainer(`${fixtures.length} fixture days`, fixtures.length);
  const globalScope = getHistoricalScope(stats, "global");

  for (const fixture of fixtures) {
    for (const meeting of fixture.meetings ?? []) {
      const raceCode = toRaceCode(meeting.source?.category);
      const country = meeting.source?.venue?.country ?? null;
      const raceCodeScope = getHistoricalScope(stats, `race_code:${raceCode}`);
      const countryRaceCodeScope = country
        ? getHistoricalScope(stats, `country_race_code:${country}:${raceCode}`)
        : null;

      for (const race of meeting.races ?? []) {
        const starterCount = race.derived?.activeStarterCount ?? null;
        const distanceBand = getDistanceBand(race.raceCard?.distance);
        const trackConditionGroup = getTrackConditionGroup(race.raceCard?.trackCondition);
        const pricedRunners = (race.raceCard?.finalField?.runnerRows ?? [])
          .filter((runner) => !runner.scratchedTimestamp && normalizeName(runner.name) !== "vacant box")
          .map((runner) => ({
            fixedWinPrice: getFixedWinPrice(runner),
            id: runner.id,
          }))
          .filter((runner) => runner.fixedWinPrice !== null);

        for (const favourite of race.derived?.favourites ?? []) {
          if (
            favourite.resultPosition === null
            || !Number.isFinite(favourite.fixedWinPrice)
          ) {
            continue;
          }

          const starterLabel = String(starterCount);
          const priceStart = getPriceBucketStart(favourite.fixedWinPrice);
          const priceLabel = createPriceBucketLabel(priceStart);
          const otherStartersPriceMetrics = getOtherStartersFixedWinPriceMetrics(pricedRunners, favourite.id);
          const otherStartersAveragePriceBucket = createOtherStartersAveragePriceBucket(
            otherStartersPriceMetrics.average,
          );

          for (const scope of [globalScope, raceCodeScope, countryRaceCodeScope].filter(Boolean)) {
            addStatsBucketToScope(scope, "starter_count", starterLabel, favourite, starterCount);
            addStatsBucketToScope(scope, "price_bucket", priceLabel, favourite, starterCount);

            if (distanceBand) {
              addStatsBucketToScope(scope, "distance_band", distanceBand, favourite, starterCount);
            }

            if (trackConditionGroup) {
              addStatsBucketToScope(scope, "track_condition", trackConditionGroup, favourite, starterCount);
            }

            if (otherStartersAveragePriceBucket) {
              addStatsBucketToScope(
                scope,
                "other_starters_average_price_bucket",
                otherStartersAveragePriceBucket.label,
                favourite,
                starterCount,
              );
            }
          }
        }
      }
    }
  }

  for (const [scopeKey, scope] of Object.entries(stats.scopes)) {
    stats.scopes[scopeKey] = {
      byDistanceBand: finalizeBucketMap(scope.byDistanceBand),
      byOtherStartersAveragePriceBucket: finalizeBucketMap(scope.byOtherStartersAveragePriceBucket),
      byPriceBucket: finalizeBucketMap(scope.byPriceBucket),
      byStarterCount: finalizeBucketMap(scope.byStarterCount),
      byTrackConditionGroup: finalizeBucketMap(scope.byTrackConditionGroup),
    };
  }

  stats.byDistanceBand = stats.scopes.global?.byDistanceBand ?? {};
  stats.byOtherStartersAveragePriceBucket = stats.scopes.global?.byOtherStartersAveragePriceBucket ?? {};
  stats.byPriceBucket = stats.scopes.global?.byPriceBucket ?? {};
  stats.byStarterCount = stats.scopes.global?.byStarterCount ?? {};
  stats.byTrackConditionGroup = stats.scopes.global?.byTrackConditionGroup ?? {};

  return stats;
}

/**
 * Adapts stored Supabase insight aggregates into the promotion signal bucket contract.
 */
export function createHistoricalStatsFromInsightAggregates(rows) {
  const stats = createHistoricalStatsContainer(`${rows?.length ?? 0} stored insight aggregate rows`, rows?.length ?? 0);

  for (const row of rows ?? []) {
    const bucket = {
      averageReturnPerDollar: Number(row.average_return_per_dollar ?? 0),
      averageValuePerDollarWithBonusCredit: Number(row.average_value_per_dollar_with_bonus_credit ?? 0),
      bonusBetCreditPercentage: Number(row.bonus_credit_percentage ?? 0),
      bonusBetCredits: Number(row.total_bonus_credit ?? 0),
      favouriteSelections: Number(row.favourite_selections ?? 0),
      label: String(
        row.price_bucket_label
          ?? row.starter_count
          ?? row.distance_band
          ?? row.other_starters_average_price_bucket_label
          ?? row.track_condition_group
          ?? "Unknown",
      ),
      profitLoss: Number(row.net_return ?? 0),
      profitLossWithBonusCredit: Number(
        row.net_value_with_bonus_credit
          ?? ((row.total_value_with_bonus_credit ?? 0) - (row.total_stake ?? 0)),
      ),
      secondPercentage: Number(row.second_percentage ?? 0),
      seconds: Number(row.seconds ?? 0),
      thirdPercentage: Number(row.third_percentage ?? 0),
      thirds: Number(row.thirds ?? 0),
      totalBonusBetCredit: Number(row.total_bonus_credit ?? 0),
      totalReturn: Number(row.total_return ?? 0),
      totalStake: Number(row.total_stake ?? 0),
      totalValueWithBonusCredit: Number(row.total_value_with_bonus_credit ?? 0),
      winPercentage: Number(row.win_percentage ?? 0),
      wins: Number(row.wins ?? 0),
    };

    const scopeKey = row.country && row.race_code
      ? `country_race_code:${row.country}:${row.race_code}`
      : row.race_code
        ? `race_code:${row.race_code}`
        : "global";
    const scope = getHistoricalScope(stats, scopeKey);

    if (row.scope_type === "starter_count" && row.starter_count !== null && row.starter_count !== undefined) {
      scope.byStarterCount.set(String(row.starter_count), bucket);
    } else if (row.scope_type === "price_bucket" && row.price_bucket_label) {
      scope.byPriceBucket.set(row.price_bucket_label, bucket);
    } else if (row.scope_type === "distance_band" && row.distance_band) {
      scope.byDistanceBand.set(row.distance_band, bucket);
    } else if (row.scope_type === "other_starters_average_price_bucket" && row.other_starters_average_price_bucket_label) {
      scope.byOtherStartersAveragePriceBucket.set(row.other_starters_average_price_bucket_label, bucket);
    } else if (row.scope_type === "track_condition" && row.track_condition_group) {
      scope.byTrackConditionGroup.set(row.track_condition_group, bucket);
    }
  }

  for (const [scopeKey, scope] of Object.entries(stats.scopes)) {
    stats.scopes[scopeKey] = {
      byDistanceBand: finalizeBucketMap(scope.byDistanceBand),
      byOtherStartersAveragePriceBucket: finalizeBucketMap(scope.byOtherStartersAveragePriceBucket),
      byPriceBucket: finalizeBucketMap(scope.byPriceBucket),
      byStarterCount: finalizeBucketMap(scope.byStarterCount),
      byTrackConditionGroup: finalizeBucketMap(scope.byTrackConditionGroup),
    };
  }

  stats.byDistanceBand = stats.scopes.global?.byDistanceBand ?? {};
  stats.byOtherStartersAveragePriceBucket = stats.scopes.global?.byOtherStartersAveragePriceBucket ?? {};
  stats.byPriceBucket = stats.scopes.global?.byPriceBucket ?? {};
  stats.byStarterCount = stats.scopes.global?.byStarterCount ?? {};
  stats.byTrackConditionGroup = stats.scopes.global?.byTrackConditionGroup ?? {};

  return stats;
}

/**
 * Selects the source-backed fixed-win price row across NZ/AUS and HK product IDs.
 */
function getFixedWinPrice(runner) {
  const price = runner.prices?.find((candidate) =>
    FIXED_WIN_PRICE_ID_PATTERNS.some((pattern) => String(candidate.id).includes(pattern)),
  );
  const decimal = Number(price?.odds?.decimal);

  return Number.isFinite(decimal) ? decimal : null;
}

/**
 * Calculates the other-starter fixed-win average while excluding extreme prices.
 */
function getOtherStartersFixedWinPriceMetrics(pricedRunners, favouriteId) {
  const otherPrices = pricedRunners
    .filter((runner) => runner.id !== favouriteId)
    .map((runner) => Number(runner.fixedWinPrice))
    .filter((price) => Number.isFinite(price));
  const usablePrices = otherPrices.filter((price) => price < OTHER_STARTER_PRICE_OUTLIER_CUTOFF);

  return {
    average: usablePrices.length
      ? Number((usablePrices.reduce((total, price) => total + price, 0) / usablePrices.length).toFixed(2))
      : null,
    outlierCount: otherPrices.length - usablePrices.length,
    priceCount: usablePrices.length,
  };
}

function deriveRaceCardRecommendation(raceCard, context, historicalStats) {
  const runnerRows = raceCard.finalField?.runnerRows ?? [];
  const activeRunners = runnerRows.filter(
    (runner) => !runner.scratchedTimestamp && normalizeName(runner.name) !== "vacant box",
  );
  const pricedRunners = activeRunners
    .map((runner) => ({
      fixedWinPrice: getFixedWinPrice(runner),
      id: runner.id,
      isMarketMover: Boolean(runner.isMarketMover),
      name: runner.name,
      number: runner.number,
    }))
    .filter((runner) => runner.fixedWinPrice !== null);
  const marketMover = activeRunners.find((runner) => runner.isMarketMover);
  const targetRunner = context.targetRunnerNumber === null
    ? null
    : activeRunners.find((runner) => runner.number === context.targetRunnerNumber) ?? null;
  const shortestPrice = pricedRunners.reduce((minimum, runner) => (
    minimum === null || runner.fixedWinPrice < minimum ? runner.fixedWinPrice : minimum
  ), null);
  const favourites = shortestPrice === null
    ? []
    : pricedRunners.filter((runner) => runner.fixedWinPrice === shortestPrice);
  const favourite = favourites[0] ?? null;
  const priceBucketLabel = favourite ? createPriceBucketLabel(getPriceBucketStart(favourite.fixedWinPrice)) : null;
  const otherStartersFixedWin = favourite
    ? getOtherStartersFixedWinPriceMetrics(pricedRunners, favourite.id)
    : { average: null, outlierCount: 0, priceCount: 0 };
  const otherStartersAveragePriceBucketInfo = createOtherStartersAveragePriceBucket(
    otherStartersFixedWin.average,
  );
  const otherStartersAveragePriceBucket = otherStartersAveragePriceBucketInfo
    ? historicalStats.byOtherStartersAveragePriceBucket?.[otherStartersAveragePriceBucketInfo.label] ?? null
    : null;
  const starterBucket = historicalStats.byStarterCount[String(activeRunners.length)] ?? null;
  const priceBucket = priceBucketLabel ? historicalStats.byPriceBucket[priceBucketLabel] ?? null : null;
  const impliedWinPercentage = favourite ? Number(((1 / favourite.fixedWinPrice) * 100).toFixed(2)) : null;
  const historicalWinPercentage = priceBucket?.winPercentage ?? null;
  const historicalDelta = impliedWinPercentage !== null && historicalWinPercentage !== null
    ? Number((historicalWinPercentage - impliedWinPercentage).toFixed(2))
    : null;

  let signal = {
    detail: "Fixed-win prices are not currently available, so favourite and price-bucket comparison cannot be calculated yet.",
    label: "Price unavailable",
    tone: "muted",
  };

  if (favourite && historicalDelta !== null) {
    if (historicalDelta >= 5) {
      signal = {
        detail: "Historical price-bucket win rate is at least 5 percentage points above the implied win rate.",
        label: "Positive historical signal",
        tone: "positive",
      };
    } else if (historicalDelta <= -5) {
      signal = {
        detail: "Historical price-bucket win rate is at least 5 percentage points below the implied win rate.",
        label: "Weak historical signal",
        tone: "caution",
      };
    } else {
      signal = {
        detail: "Historical price-bucket win rate is close to the implied win rate.",
        label: "Neutral historical signal",
        tone: "neutral",
      };
    }
  } else if (favourite) {
    signal = {
      detail: "Favourite price is available, but there is not enough matching historical bucket data yet.",
      label: "Limited history",
      tone: "neutral",
    };
  }

  return {
    advertisedStart: raceCard.advertisedStart,
    code: context.raceCode,
    distanceBand: getDistanceBand(raceCard.distance),
    favourite: favourite
      ? {
          fixedWinPrice: favourite.fixedWinPrice,
          impliedWinPercentage,
          name: favourite.name,
          number: favourite.number,
          priceBucket: priceBucketLabel,
        }
      : null,
    fieldPriceShape: {
      otherStartersAverageFixedWinPrice: otherStartersFixedWin.average,
      otherStartersAveragePriceBucket: otherStartersAveragePriceBucketInfo?.label ?? null,
      otherStartersPriceCount: otherStartersFixedWin.priceCount,
      otherStartersPriceOutlierCount: otherStartersFixedWin.outlierCount,
      outlierCutoff: OTHER_STARTER_PRICE_OUTLIER_CUTOFF,
    },
    historical: {
      historicalDelta,
      otherStartersAveragePriceBucket,
      priceBucket,
      starterBucket,
    },
    marketMover: marketMover
      ? {
          name: marketMover.name,
          number: marketMover.number,
        }
      : null,
    raceCardId: raceCard.id,
    raceName: raceCard.name,
    raceNumber: raceCard.number,
    signal,
    starters: activeRunners.length,
    status: raceCard.status,
    targetRunner: targetRunner
      ? {
          fixedWinPrice: getFixedWinPrice(targetRunner),
          name: targetRunner.name,
          number: targetRunner.number,
        }
      : null,
    track: context.track,
    trackConditionGroup: getTrackConditionGroup(raceCard.trackCondition),
  };
}

/**
 * Resolves a Betcha meeting into the prediction coverage set for all NZ/AUS/HK domestic races.
 */
function findTargetBetBackTrack(meeting) {
  const meetingNames = [
    meeting.name,
    meeting.venue?.name,
    meeting.meetingCode,
  ].map(normalizeName);
  const configuredTrack = TARGET_BET_BACK_TRACKS.find((track) =>
    meeting.venue?.country === track.country
    && track.aliases.some((alias) =>
      meetingNames.some((name) => name === alias || name.includes(alias)),
    ),
  );

  if (configuredTrack) {
    return configuredTrack;
  }

  if (!["AUS", "HK", "NZ"].includes(meeting.venue?.country)) {
    return null;
  }

  const canonicalName = meeting.venue?.name ?? meeting.name ?? meeting.meetingCode;

  return canonicalName
    ? {
        aliases: meetingNames,
        canonicalName,
        country: meeting.venue.country,
      }
    : null;
}

function weightedAverage(entries) {
  const usableEntries = entries.filter(({ value }) => Number.isFinite(value));
  const totalWeight = usableEntries.reduce((total, entry) => total + entry.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return Number((
    usableEntries.reduce((total, entry) => total + (entry.value * entry.weight), 0) / totalWeight
  ).toFixed(3));
}

function getScopedHistoricalStats(historicalStats, scopeKey) {
  return historicalStats.scopes?.[scopeKey] ?? {
    byDistanceBand: {},
    byPriceBucket: {},
    byStarterCount: {},
    byTrackConditionGroup: {},
  };
}

function shrinkBucketValue(scopedBucket, globalBucket, field) {
  const scopedValue = Number(scopedBucket?.[field]);
  const globalValue = Number(globalBucket?.[field]);

  if (!Number.isFinite(scopedValue)) {
    return Number.isFinite(globalValue) ? globalValue : null;
  }

  if (!Number.isFinite(globalValue)) {
    return scopedValue;
  }

  const scopedSampleSize = Number(scopedBucket?.favouriteSelections ?? 0);
  const scopedWeight = scopedSampleSize / (scopedSampleSize + SCOPED_MODEL_MIN_SAMPLE);

  return Number(((scopedValue * scopedWeight) + (globalValue * (1 - scopedWeight))).toFixed(3));
}

function createBetBackModelSignal(
  score,
  sampleSize,
  scopeLabel,
  metricLabel = "cash-plus-bonus",
  bucketBasisLabel = "matching favourite price and starter buckets",
) {
  const baseSignal = createBetBackSignal(score, sampleSize, metricLabel, bucketBasisLabel);

  return {
    ...baseSignal,
    detail: `${baseSignal.detail} Scope: ${scopeLabel}.`,
  };
}

/**
 * Scores candidates from global price and starter buckets using configurable cash-return weights.
 */
function createCashOnlyPredictionModel(candidate, priceWeight = 0.65, starterWeight = 0.35) {
  const priceBucket = candidate.historical.priceBucket;
  const starterBucket = candidate.historical.starterBucket;
  const bucketBasisLabel = priceWeight > 0 && starterWeight > 0
    ? "matching favourite price and starter buckets"
    : priceWeight > 0
      ? "matching favourite price bucket"
      : "matching final-starter-count bucket";
  const metricLabel = priceWeight > 0 && starterWeight > 0
    ? "cash average"
    : priceWeight > 0
      ? "price-bucket cash average"
      : "starter-count cash average";
  const score = weightedAverage([
    {
      value: priceBucket?.averageReturnPerDollar,
      weight: priceWeight,
    },
    {
      value: starterBucket?.averageReturnPerDollar,
      weight: starterWeight,
    },
  ]);
  const sampleSize = (priceWeight > 0 ? priceBucket?.favouriteSelections ?? 0 : 0)
    + (starterWeight > 0 ? starterBucket?.favouriteSelections ?? 0 : 0);
  const signal = createBetBackModelSignal(
    score,
    sampleSize,
    "all countries and all disciplines",
    metricLabel,
    bucketBasisLabel,
  );

  return {
    blendedCashPlusBonusAverage: score,
    cashAverageScore: score,
    detail: signal.detail,
    label: signal.label,
    sampleSize,
    tone: signal.tone,
  };
}

function createOtherStartersAveragePricePredictionModel(candidate) {
  const bucket = candidate.historical.otherStartersAveragePriceBucket;
  const score = Number.isFinite(Number(bucket?.averageReturnPerDollar))
    ? Number(bucket.averageReturnPerDollar)
    : null;
  const sampleSize = bucket?.favouriteSelections ?? 0;
  const signal = createBetBackModelSignal(
    score,
    sampleSize,
    "all countries and all disciplines",
    "other-starters average price cash average",
    "matching other-starters average fixed-win price bucket",
  );

  return {
    blendedCashPlusBonusAverage: score,
    cashAverageScore: score,
    detail: signal.detail,
    label: signal.label,
    sampleSize,
    tone: signal.tone,
  };
}

function createDefaultPredictionModel(candidate) {
  const priceBucket = candidate.historical.priceBucket;
  const starterBucket = candidate.historical.starterBucket;
  const cashPlusBonusScore = weightedAverage([
    {
      value: priceBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.65,
    },
    {
      value: starterBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.35,
    },
  ]);
  const cashScore = weightedAverage([
    {
      value: priceBucket?.averageReturnPerDollar,
      weight: 0.65,
    },
    {
      value: starterBucket?.averageReturnPerDollar,
      weight: 0.35,
    },
  ]);
  const sampleSize = (priceBucket?.favouriteSelections ?? 0)
    + (starterBucket?.favouriteSelections ?? 0);
  const signal = createBetBackModelSignal(
    cashScore,
    sampleSize,
    "all countries and all disciplines",
    "cash average",
  );

  return {
    blendedCashPlusBonusAverage: cashPlusBonusScore,
    cashAverageScore: cashScore,
    detail: signal.detail,
    label: signal.label,
    sampleSize,
    tone: signal.tone,
  };
}

function createScopedPredictionModel(candidate, historicalStats, context) {
  const globalPriceBucket = candidate.historical.priceBucket;
  const globalStarterBucket = candidate.historical.starterBucket;
  const scopeKey = context.country && context.raceCode
    ? `country_race_code:${context.country}:${context.raceCode}`
    : context.raceCode
      ? `race_code:${context.raceCode}`
      : "global";
  const scopedStats = getScopedHistoricalStats(historicalStats, scopeKey);
  const scopedPriceBucket = candidate.favourite?.priceBucket
    ? scopedStats.byPriceBucket[candidate.favourite.priceBucket] ?? null
    : null;
  const scopedStarterBucket = scopedStats.byStarterCount[String(candidate.starters)] ?? null;
  const cashPlusBonusScore = weightedAverage([
    {
      value: shrinkBucketValue(scopedPriceBucket, globalPriceBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.65,
    },
    {
      value: shrinkBucketValue(scopedStarterBucket, globalStarterBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.35,
    },
  ]);
  const cashScore = weightedAverage([
    {
      value: shrinkBucketValue(scopedPriceBucket, globalPriceBucket, "averageReturnPerDollar"),
      weight: 0.65,
    },
    {
      value: shrinkBucketValue(scopedStarterBucket, globalStarterBucket, "averageReturnPerDollar"),
      weight: 0.35,
    },
  ]);
  const sampleSize = (scopedPriceBucket?.favouriteSelections ?? 0)
    + (scopedStarterBucket?.favouriteSelections ?? 0);
  const scopeLabel = context.country && context.raceCode
    ? `${context.country} ${context.raceCode}`
    : context.raceCode ?? "global";
  const signal = createBetBackModelSignal(
    cashScore,
    sampleSize,
    `${scopeLabel}, shrunk toward global buckets`,
    "cash average",
  );

  return {
    blendedCashPlusBonusAverage: cashPlusBonusScore,
    cashAverageScore: cashScore,
    detail: signal.detail,
    label: signal.label,
    sampleSize,
    tone: signal.tone,
  };
}

function createDistanceConditionPredictionModel(candidate, historicalStats, context) {
  const globalDistanceBucket = candidate.distanceBand
    ? historicalStats.byDistanceBand?.[candidate.distanceBand] ?? null
    : null;
  const globalPriceBucket = candidate.historical.priceBucket;
  const globalStarterBucket = candidate.historical.starterBucket;
  const globalTrackConditionBucket = candidate.trackConditionGroup
    ? historicalStats.byTrackConditionGroup?.[candidate.trackConditionGroup] ?? null
    : null;
  const scopeKey = context.country && context.raceCode
    ? `country_race_code:${context.country}:${context.raceCode}`
    : context.raceCode
      ? `race_code:${context.raceCode}`
      : "global";
  const scopedStats = getScopedHistoricalStats(historicalStats, scopeKey);
  const scopedDistanceBucket = candidate.distanceBand
    ? scopedStats.byDistanceBand?.[candidate.distanceBand] ?? null
    : null;
  const scopedPriceBucket = candidate.favourite?.priceBucket
    ? scopedStats.byPriceBucket[candidate.favourite.priceBucket] ?? null
    : null;
  const scopedStarterBucket = scopedStats.byStarterCount[String(candidate.starters)] ?? null;
  const scopedTrackConditionBucket = candidate.trackConditionGroup
    ? scopedStats.byTrackConditionGroup?.[candidate.trackConditionGroup] ?? null
    : null;
  const cashPlusBonusScore = weightedAverage([
    {
      value: shrinkBucketValue(scopedPriceBucket, globalPriceBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.45,
    },
    {
      value: shrinkBucketValue(scopedStarterBucket, globalStarterBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.25,
    },
    {
      value: shrinkBucketValue(scopedDistanceBucket, globalDistanceBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.2,
    },
    {
      value: shrinkBucketValue(scopedTrackConditionBucket, globalTrackConditionBucket, "averageValuePerDollarWithBonusCredit"),
      weight: 0.1,
    },
  ]);
  const cashScore = weightedAverage([
    {
      value: shrinkBucketValue(scopedPriceBucket, globalPriceBucket, "averageReturnPerDollar"),
      weight: 0.45,
    },
    {
      value: shrinkBucketValue(scopedStarterBucket, globalStarterBucket, "averageReturnPerDollar"),
      weight: 0.25,
    },
    {
      value: shrinkBucketValue(scopedDistanceBucket, globalDistanceBucket, "averageReturnPerDollar"),
      weight: 0.2,
    },
    {
      value: shrinkBucketValue(scopedTrackConditionBucket, globalTrackConditionBucket, "averageReturnPerDollar"),
      weight: 0.1,
    },
  ]);
  const sampleSize = (scopedPriceBucket?.favouriteSelections ?? 0)
    + (scopedStarterBucket?.favouriteSelections ?? 0)
    + (scopedDistanceBucket?.favouriteSelections ?? 0)
    + (scopedTrackConditionBucket?.favouriteSelections ?? 0);
  const scopeLabel = context.country && context.raceCode
    ? `${context.country} ${context.raceCode}`
    : context.raceCode ?? "global";
  const signal = createBetBackModelSignal(
    cashScore,
    sampleSize,
    `${scopeLabel}, with distance ${candidate.distanceBand ?? "unknown"} and condition ${candidate.trackConditionGroup ?? "unknown"} shrunk toward broader buckets`,
    "cash average",
  );

  return {
    blendedCashPlusBonusAverage: cashPlusBonusScore,
    cashAverageScore: cashScore,
    detail: signal.detail,
    label: signal.label,
    sampleSize,
    tone: signal.tone,
  };
}

function buildPredictionModelsForCandidate(candidate, historicalStats, context) {
  return {
    [DEFAULT_PREDICTION_MODEL_KEY]: createDefaultPredictionModel(candidate),
    [CASH_ONLY_PREDICTION_MODEL_KEY]: createCashOnlyPredictionModel(candidate),
    [CASH_EVEN_PREDICTION_MODEL_KEY]: createCashOnlyPredictionModel(candidate, 0.5, 0.5),
    [CASH_PRICE_ONLY_PREDICTION_MODEL_KEY]: createCashOnlyPredictionModel(candidate, 1, 0),
    [CASH_STARTER_ONLY_PREDICTION_MODEL_KEY]: createCashOnlyPredictionModel(candidate, 0, 1),
    [OTHER_STARTERS_AVERAGE_PRICE_MODEL_KEY]: createOtherStartersAveragePricePredictionModel(candidate),
    [SCOPED_PREDICTION_MODEL_KEY]: createScopedPredictionModel(candidate, historicalStats, context),
    [DISTANCE_CONDITION_PREDICTION_MODEL_KEY]: createDistanceConditionPredictionModel(candidate, historicalStats, context),
  };
}

function getPredictionModelSortScore(candidate, modelKey) {
  return candidate.predictionModels?.[modelKey]?.cashAverageScore
    ?? candidate.candidate?.cashAverageScore
    ?? null;
}

function createBetBackSignal(
  score,
  sampleSize,
  metricLabel = "cash-plus-bonus",
  bucketBasisLabel = "matching favourite price and starter buckets",
) {
  if (score === null) {
    return {
      detail: "Favourite price is available, but matching historical starter or price bucket data is limited.",
      label: "Limited history",
      tone: "neutral",
    };
  }

  if (sampleSize < 10) {
    return {
      detail: "Historical bucket data is available, but the sample size is small.",
      label: "Small sample",
      tone: "neutral",
    };
  }

  if (score >= 1.05) {
    return {
      detail: `Historical ${metricLabel} is above break-even for the ${bucketBasisLabel}.`,
      label: "Positive candidate",
      tone: "positive",
    };
  }

  if (score >= 0.95) {
    return {
      detail: `Historical ${metricLabel} is close to break-even for the ${bucketBasisLabel}.`,
      label: "Neutral candidate",
      tone: "neutral",
    };
  }

  return {
    detail: `Historical ${metricLabel} is below break-even for the ${bucketBasisLabel}.`,
    label: "Weak candidate",
    tone: "caution",
  };
}

function deriveBetBackCandidate(raceCard, context, historicalStats) {
  const recommendation = deriveRaceCardRecommendation(raceCard, context, historicalStats);

  if (!recommendation.favourite) {
    return null;
  }

  const predictionModels = buildPredictionModelsForCandidate(recommendation, historicalStats, context);
  const defaultModel = predictionModels[DEFAULT_PREDICTION_MODEL_KEY];

  return {
    ...recommendation,
    candidate: defaultModel,
    canonicalTrack: context.canonicalTrack,
    country: context.country ?? null,
    predictionModels,
    sourceTrack: context.track,
  };
}

/**
 * Orders Betcha bet-back candidates by the active model's cashAverageScore within country and discipline.
 */
function rankBetBackCandidatesByCountryAndDiscipline(candidates, modelKey = DEFAULT_PREDICTION_MODEL_KEY) {
  const disciplineOrder = ["horse", "harness", "greyhound"];
  const grouped = new Map();

  for (const candidate of candidates) {
    const country = candidate.country ?? "unknown";
    const raceCode = candidate.code ?? "unknown";
    const groupKey = `${country}:${raceCode}`;
    const matchingCandidates = grouped.get(groupKey) ?? [];
    matchingCandidates.push(candidate);
    grouped.set(groupKey, matchingCandidates);
  }

  return Array.from(grouped.entries())
    .sort(([leftKey], [rightKey]) => {
      const [leftCountry, leftCode] = leftKey.split(":");
      const [rightCountry, rightCode] = rightKey.split(":");
      const countrySort = leftCountry.localeCompare(rightCountry);

      if (countrySort !== 0) {
        return countrySort;
      }

      const leftIndex = disciplineOrder.indexOf(leftCode);
      const rightIndex = disciplineOrder.indexOf(rightCode);

      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }

      return leftCode.localeCompare(rightCode);
    })
    .flatMap(([, disciplineCandidates]) =>
      disciplineCandidates
        .map((candidate) => ({
          ...candidate,
          candidate: candidate.predictionModels?.[modelKey] ?? candidate.candidate,
        }))
        .sort((left, right) => {
          const rightScore = getPredictionModelSortScore(right, modelKey) ?? -Infinity;
          const leftScore = getPredictionModelSortScore(left, modelKey) ?? -Infinity;

          if (rightScore !== leftScore) {
            return rightScore - leftScore;
          }

          return new Date(left.advertisedStart).valueOf()
            - new Date(right.advertisedStart).valueOf();
        })
        .slice(0, BET_BACK_CANDIDATES_PER_COUNTRY_DISCIPLINE)
        .map((candidate, index) => ({
          ...candidate,
          rank: index + 1,
        })),
    );
}

async function fetchBetBackCandidates(source, historicalStats, date) {
  const response = await graphql(source, "RacingHomeMeetingsDesktopScreen", RACING_DAY_QUERY, {
    categories: ["HORSE", "HARNESS", "GREYHOUND"],
    date,
    regions: ["DOMESTIC"],
  });
  const meetings = response.data?.racingDay?.meetings ?? [];
  const targetMeetings = meetings
    .map((meeting) => ({
      meeting,
      targetTrack: findTargetBetBackTrack(meeting),
    }))
    .filter(({ targetTrack }) => targetTrack !== null);
  const candidates = [];
  const errors = [];
  const eligibleRaceStarts = [];
  let scannedRaceCount = 0;

  for (const { meeting, targetTrack } of targetMeetings) {
    for (const race of meeting.races?.nodes ?? []) {
      scannedRaceCount += 1;

      try {
        if (race.advertisedStart) {
          eligibleRaceStarts.push(race.advertisedStart);
        }

        const raceCard = (await graphql(source, "RaceCardLite", RACE_CARD_QUERY, {
          id: toRaceCardId(race.id),
        })).data?.raceCard;

        if (!raceCard) {
          continue;
        }

        if (raceCard.advertisedStart) {
          eligibleRaceStarts.push(raceCard.advertisedStart);
        }

        const candidate = deriveBetBackCandidate(raceCard, {
          canonicalTrack: targetTrack.canonicalName,
          country: targetTrack.country,
          raceCode: toRaceCode(meeting.category),
          targetRunnerNumber: null,
          track: meeting.name,
        }, historicalStats);

        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        errors.push({
          message: error.message,
          raceId: race.id,
        });
      }
    }
  }

  const models = PREDICTION_MODELS.map((model) => ({
    ...model,
    candidates: rankBetBackCandidatesByCountryAndDiscipline(candidates, model.key),
  }));
  const rankedCandidates = models.find((model) => model.key === DEFAULT_PREDICTION_MODEL_KEY)?.candidates
    ?? rankBetBackCandidatesByCountryAndDiscipline(candidates);

  return {
    candidates: rankedCandidates,
    eligibleRaceCount: candidates.length,
    errors,
    firstEligibleRaceStart: getEarliestIsoDate(eligibleRaceStarts),
    models,
    note: "Betcha bet-back candidates scan current races across all NZ/AUS/HK domestic meetings returned by the source. Ranking is grouped by country and discipline and keeps up to five candidates per country/discipline ordered by the active prediction model's cashAverageScore. Scores are statistical signals only, not stake sizing or automated wagering advice.",
    provider: source.label,
    scannedMeetings: targetMeetings.length,
    scannedRaceCount,
    source: source.source,
  };
}

async function fetchRacingDayForRace(source, raceCard, cache) {
  const date = getNzDateFromIso(raceCard.advertisedStart);
  const cacheKey = `${source.source}:${date}`;

  if (!cache.has(cacheKey)) {
    const response = await graphql(source, "RacingHomeMeetingsDesktopScreen", RACING_DAY_QUERY, {
      categories: ["HORSE", "HARNESS", "GREYHOUND"],
      date,
      regions: ["DOMESTIC"],
    });
    cache.set(cacheKey, response.data?.racingDay?.meetings ?? []);
  }

  return cache.get(cacheKey);
}

async function expandPromotionRaceCards(source, promotion, primaryRaceCard, racingDayCache) {
  const range = extractRaceRange(promotion.description);
  const meetings = await fetchRacingDayForRace(source, primaryRaceCard, racingDayCache);
  const primaryUuid = primaryRaceCard.id.replace(/^RacingRaceCard:/, "");
  const meeting = meetings.find((candidate) =>
    (candidate.races?.nodes ?? []).some((race) => String(race.id).includes(primaryUuid)),
  );

  if (!meeting) {
    return [{
      context: {
        raceCode: "unknown",
        targetRunnerNumber: extractTargetRunnerNumber(promotion.description),
        track: toTitleCase(String(promotion.uri).split("/")[2] ?? "Unknown"),
      },
      raceCard: primaryRaceCard,
    }];
  }

  const races = meeting.races?.nodes ?? [];
  const selectedRaces = range
    ? races.filter((race) => race.number >= range.from && race.number <= range.to)
    : races.filter((race) => String(race.id).includes(primaryUuid));
  const expanded = [];

  for (const race of selectedRaces) {
    const raceCardId = toRaceCardId(race.id);
    const raceCard = raceCardId === primaryRaceCard.id
      ? primaryRaceCard
      : (await graphql(source, "RaceCardLite", RACE_CARD_QUERY, { id: raceCardId })).data?.raceCard;

    if (!raceCard) {
      continue;
    }

    expanded.push({
      context: {
        raceCode: toRaceCode(meeting.category),
        targetRunnerNumber: extractTargetRunnerNumber(promotion.description),
        track: meeting.name,
      },
      raceCard,
    });
  }

  return expanded;
}

async function fetchSourceRecommendations(source, historicalStats) {
  const promotionResponse = await fetchAllPromotions(source);
  const racingDayCache = new Map();
  const allPromotions = promotionResponse.promotions;
  const racingPromotions = dedupePromotionsByContent(allPromotions.filter(isRacingPromotion));
  const recommendations = [];

  for (const promotion of racingPromotions) {
    const uuid = extractUuidFromRacingUri(promotion.uri);
    const basePromotion = {
      ...mapPromotionSummary(source, promotion),
    };

    if (!uuid) {
      recommendations.push({
        ...basePromotion,
        coverage: "broad",
        note: "Broad racing promotion without a specific race-card URL.",
        races: [],
      });
      continue;
    }

    const primaryRaceCard = (await graphql(source, "RaceCardLite", RACE_CARD_QUERY, {
      id: `RacingRaceCard:${uuid}`,
    })).data?.raceCard;

    if (!primaryRaceCard) {
      recommendations.push({
        ...basePromotion,
        coverage: "race_specific",
        note: "Promotion has a race-card URL, but the race card did not resolve.",
        races: [],
      });
      continue;
    }

    const raceCards = await expandPromotionRaceCards(source, promotion, primaryRaceCard, racingDayCache);

    recommendations.push({
      ...basePromotion,
      coverage: "race_specific",
      raceRange: extractRaceRange(promotion.description),
      targetRunnerNumber: extractTargetRunnerNumber(promotion.description),
      races: raceCards.map(({ context, raceCard }) =>
        deriveRaceCardRecommendation(raceCard, context, historicalStats),
      ),
    });
  }

  return {
    allPromotionCount: allPromotions.length,
    allPromotions: allPromotions.map((promotion) => mapPromotionSummary(source, promotion)),
    promotionPageCount: promotionResponse.pageCount,
    racingPromotionCount: racingPromotions.length,
    recommendations,
    source: source.source,
  };
}

/**
 * Generates the current app-facing promotions payload from source-backed data.
 */
export async function generateCurrentPromotionPayload({
  date = getTodayNzDate(),
  generatedAt = new Date(),
  historicalStats,
} = {}) {
  if (!historicalStats) {
    throw new Error("Historical promotion signal stats are required.");
  }

  const sourceResults = [];

  for (const source of SOURCES) {
    sourceResults.push(await fetchSourceRecommendations(source, historicalStats));
  }

  const betchaSource = SOURCES.find((source) => source.source === "betcha");
  const betBackCandidates = betchaSource
    ? await fetchBetBackCandidates(betchaSource, historicalStats, date)
    : null;

  return {
    betBackCandidates,
    generatedAt: generatedAt.toISOString(),
    generatedAtNz: formatNzDateTime(generatedAt),
    note: "Public racing promotions are matched to current race cards where a race-card URL is available. Signals are statistical comparisons only, not staking advice or automated wagering instructions.",
    sourceDate: date,
    sourceTimeZone: SOURCE_TIME_ZONE,
    sources: sourceResults,
    statsBasis: {
      basisLabel: historicalStats.basisLabel ?? `${historicalStats.fixtureCount} fixture days`,
      fixtureCount: historicalStats.fixtureCount,
      otherStartersAveragePriceBucketCount: Object.keys(historicalStats.byOtherStartersAveragePriceBucket ?? {}).length,
      priceBucketCount: Object.keys(historicalStats.byPriceBucket).length,
      starterBucketCount: Object.keys(historicalStats.byStarterCount).length,
    },
    summary: {
      raceSpecificPromotions: sourceResults.reduce(
        (total, result) => total + result.recommendations.filter((promotion) => promotion.races.length).length,
        0,
      ),
      racingPromotions: sourceResults.reduce((total, result) => total + result.racingPromotionCount, 0),
      betBackCandidates: betBackCandidates?.candidates.length ?? 0,
      sources: sourceResults.length,
    },
  };
}

/**
 * Generates current Betcha candidate predictions without fetching or matching public promotions.
 */
export async function generateCurrentPredictionPayload({
  date = getTodayNzDate(),
  generatedAt = new Date(),
  historicalStats,
} = {}) {
  if (!historicalStats) {
    throw new Error("Historical prediction signal stats are required.");
  }

  const betchaSource = SOURCES.find((source) => source.source === "betcha");
  const betBackCandidates = betchaSource
    ? await fetchBetBackCandidates(betchaSource, historicalStats, date)
    : null;
  const predictionWindow = createPredictionWindowStatus({
    firstRaceStart: betBackCandidates?.firstEligibleRaceStart ?? null,
    generatedAt,
  });

  return {
    betBackCandidates,
    generatedAt: generatedAt.toISOString(),
    generatedAtNz: formatNzDateTime(generatedAt),
    note: "Current prediction candidates are generated from public Betcha race cards and stored historical aggregates. Signals are statistical comparisons only, not staking advice or automated wagering instructions.",
    sourceDate: date,
    sourceTimeZone: SOURCE_TIME_ZONE,
    sources: [],
    predictionWindow,
    statsBasis: {
      basisLabel: historicalStats.basisLabel ?? `${historicalStats.fixtureCount} fixture days`,
      fixtureCount: historicalStats.fixtureCount,
      otherStartersAveragePriceBucketCount: Object.keys(historicalStats.byOtherStartersAveragePriceBucket ?? {}).length,
      priceBucketCount: Object.keys(historicalStats.byPriceBucket).length,
      starterBucketCount: Object.keys(historicalStats.byStarterCount).length,
    },
    summary: {
      betBackCandidates: betBackCandidates?.candidates.length ?? 0,
      predictionWindowStatus: predictionWindow.status,
      raceSpecificPromotions: 0,
      racingPromotions: 0,
      sources: 0,
    },
  };
}
