import { publicEnv } from "../config/env";
import type { DisciplineReturn, FavouriteStat, RaceFilterOption } from "./collectedRaceDay";

type NullableNumber = number | string | null;
const DEFAULT_DATE_WINDOW_SIZE = 14;
export const DEFAULT_PREDICTION_HISTORY_ROW_LIMIT = 50;
export const DEFAULT_PREDICTION_MODEL_KEY = "global_bucket_blend_v1";

export type PredictionModelKey =
  | "global_bucket_blend_v1"
  | "global_bucket_cash_blend_v1"
  | "global_bucket_cash_even_blend_v1"
  | "global_bucket_cash_price_only_v1"
  | "global_bucket_cash_starter_only_v1"
  | "global_other_starters_average_price_cash_v1"
  | "country_code_bucket_blend_shrunk_v1"
  | "country_code_distance_condition_v1";

export type PredictionPerformanceDisciplineFilter = "all" | "horse" | "harness" | "greyhound";
export type PredictionPerformanceRankFilter = "all" | "1" | "2" | "3";
export type PredictionPerformanceSignalFilter = "all" | "positive_only" | "neutral_or_better";

export type PredictionPerformanceFilters = {
  discipline: PredictionPerformanceDisciplineFilter;
  rank: PredictionPerformanceRankFilter;
  signal: PredictionPerformanceSignalFilter;
};

export type PredictionModelVariant = {
  description: string;
  detail: string;
  key: PredictionModelKey;
  label: string;
};

export const PREDICTION_MODEL_VARIANTS: PredictionModelVariant[] = [
  {
    description: "Scores each current favourite using all-country historical cash averages for matching favourite price and final-starter-count buckets.",
    detail: "Score = 65% favourite price-bucket cash average plus 35% starter-count cash average. Cash+bonus value is retained as supporting context, not recommendation ranking.",
    key: "global_bucket_blend_v1",
    label: "Global bucket blend",
  },
  {
    description: "Scores each current favourite using all-country historical cash averages for matching favourite price and final-starter-count buckets.",
    detail: "Score = 65% favourite price-bucket cash average plus 35% starter-count cash average. Bonus-credit value is excluded, and current cards use this cash score for ordering.",
    key: "global_bucket_cash_blend_v1",
    label: "Global cash bucket blend",
  },
  {
    description: "Scores each current favourite using equal-weight all-country historical cash averages for matching favourite price and final-starter-count buckets.",
    detail: "Score = 50% favourite price-bucket cash average plus 50% starter-count cash average. Bonus-credit value is excluded, and current cards use this cash score for ordering.",
    key: "global_bucket_cash_even_blend_v1",
    label: "Global cash 50/50 blend",
  },
  {
    description: "Scores each current favourite using only the all-country historical cash average for the matching favourite price bucket.",
    detail: "Score = 100% favourite price-bucket cash average. Bonus-credit value is excluded, and current cards use this cash score for ordering.",
    key: "global_bucket_cash_price_only_v1",
    label: "Global cash price only",
  },
  {
    description: "Scores each current favourite using only the all-country historical cash average for the matching final-starter-count bucket.",
    detail: "Score = 100% starter-count cash average. Bonus-credit value is excluded, and current cards use this cash score for ordering.",
    key: "global_bucket_cash_starter_only_v1",
    label: "Global cash starters only",
  },
  {
    description: "Scores each current favourite using the all-country historical cash average for the matching average fixed-win price bucket of the other starters.",
    detail: "Score = 100% other-starters average fixed-win price bucket cash average. Other-starter prices at $70.00 or above are excluded from the average to reduce outlier distortion.",
    key: "global_other_starters_average_price_cash_v1",
    label: "Other starters avg price",
  },
  {
    description: "Scores each current favourite using country-and-discipline cash buckets when available, blended back toward the global buckets to reduce small-sample noise.",
    detail: "Score = 65% scoped price-bucket cash average plus 35% scoped starter-count cash average. Each scoped bucket is shrunk toward the matching global cash bucket.",
    key: "country_code_bucket_blend_shrunk_v1",
    label: "Country + discipline blend",
  },
  {
    description: "Scores each current favourite using country-and-discipline cash buckets for price, starter, distance-band, and track-condition signals with conservative shrinkage toward broader history.",
    detail: "Score = 45% scoped price-bucket cash average, 25% scoped starter-count cash average, 20% scoped distance-band cash average, and 10% scoped track-condition cash average. Each bucket is shrunk toward matching broader cash history.",
    key: "country_code_distance_condition_v1",
    label: "Distance + condition blend",
  },
];

type PredictionSummaryMetrics = {
  average_return_per_dollar: NullableNumber;
  average_value_per_dollar_with_bonus_credit: NullableNumber;
  bonus_credit_percentage: NullableNumber;
  missing_result_count: number;
  missing_runner_count: number;
  net_return: NullableNumber;
  pending_count: number;
  prediction_model: string | null;
  prediction_count: number;
  race_code: string | null;
  roi_percentage: NullableNumber;
  second_percentage: NullableNumber;
  seconds: number;
  settled_count: number;
  third_percentage: NullableNumber;
  thirds: number;
  total_bonus_credit: NullableNumber;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  total_value_with_bonus_credit: NullableNumber;
  win_percentage: NullableNumber;
  wins: number;
};

type PredictionAggregateRow = PredictionSummaryMetrics & {
  date_from: string | null;
  date_to: string | null;
  scope_key: string;
  scope_type: "overall" | "race_code";
};

type PredictionPerformanceSummaryRow = PredictionSummaryMetrics & {
  rank_filter: number | null;
  signal_filter: string;
};

type PredictionHistoryRow = {
  advertised_start: string | null;
  blended_cash_plus_bonus_average: NullableNumber;
  country: string | null;
  course_name: string | null;
  course_slug: string | null;
  historical_sample_size: number | null;
  id: string;
  outcome_bonus_credit: NullableNumber;
  outcome_result_position: number | null;
  outcome_starter_count: number | null;
  outcome_status: "pending" | "settled" | "race_not_found" | "missing_runner" | "missing_result";
  outcome_total_value_with_bonus_credit: NullableNumber;
  outcome_win_return: NullableNumber;
  prediction_model: string | null;
  predicted_at: string;
  predicted_fixed_win_price: NullableNumber;
  predicted_runner_name: string | null;
  predicted_runner_number: number | null;
  predicted_starter_count: number | null;
  race_code: string;
  race_name: string | null;
  race_number: number | null;
  rank: number | null;
  signal_label: string | null;
  source_date: string;
};

export type PredictionHistoryItem = {
  bonusCredit: string;
  cashReturn: string;
  country: string;
  discipline: string;
  historyDetail: string;
  id: string;
  outcomeLabel: string;
  outcomeTone: "default" | "good" | "warning";
  predictedAtLabel: string;
  predictionMeta: string;
  raceLabel: string;
  runnerLabel: string;
  signalLabel: string;
  startLabel: string;
  totalValue: string;
};

export type PredictionHistoryFilters = {
  country: string;
  course: string;
  discipline: string;
  fromDate: string;
  toDate: string;
};

export type PredictionHistoryMetadata = {
  countryOptions: RaceFilterOption[];
  courseOptionsByCountry: Map<string, RaceFilterOption[]>;
  dateOptions: RaceFilterOption[];
  defaultDateRange: {
    from: string;
    to: string;
  };
  disciplineOptions: RaceFilterOption[];
  latestWindowLabel: string;
  latestWindowRangeLabel: string;
};

export type PredictionsData = {
  disciplineReturns: DisciplineReturn[];
  history: PredictionHistoryItem[];
  summaryStats: FavouriteStat[];
  totalHistoryCount: number;
};

const PREDICTION_AGGREGATE_SELECT = [
  "average_return_per_dollar",
  "average_value_per_dollar_with_bonus_credit",
  "bonus_credit_percentage",
  "date_from",
  "date_to",
  "missing_result_count",
  "missing_runner_count",
  "net_return",
  "pending_count",
  "prediction_model",
  "prediction_count",
  "race_code",
  "roi_percentage",
  "scope_key",
  "scope_type",
  "second_percentage",
  "seconds",
  "settled_count",
  "third_percentage",
  "thirds",
  "total_bonus_credit",
  "total_return",
  "total_stake",
  "total_value_with_bonus_credit",
  "win_percentage",
  "wins",
].join(",");

const PREDICTION_HISTORY_SELECT = [
  "advertised_start",
  "blended_cash_plus_bonus_average",
  "country",
  "course_name",
  "course_slug",
  "historical_sample_size",
  "id",
  "outcome_bonus_credit",
  "outcome_result_position",
  "outcome_starter_count",
  "outcome_status",
  "outcome_total_value_with_bonus_credit",
  "outcome_win_return",
  "prediction_model",
  "predicted_at",
  "predicted_fixed_win_price",
  "predicted_runner_name",
  "predicted_runner_number",
  "predicted_starter_count",
  "race_code",
  "race_name",
  "race_number",
  "rank",
  "signal_label",
  "source_date",
].join(",");

export const hasSupabasePredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads metadata used to build Prediction history filters without loading every row.
 */
export async function fetchPredictionHistoryMetadata(): Promise<PredictionHistoryMetadata> {
  const dateRows = await supabaseSelect<{ source_date: string }>("promotion_predictions", {
    order: "source_date.desc",
    select: "source_date",
  });
  const metadataRows = await supabaseSelect<{
    country: string | null;
    course_name: string | null;
    course_slug: string | null;
    race_code: string | null;
  }>("promotion_predictions", {
    order: "country.asc,course_name.asc,race_code.asc",
    select: "country,course_name,course_slug,race_code",
  });
  const dates = unique(dateRows.map((row) => row.source_date)).sort();
  const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);
  const from = latestDates[0] ?? dates[0] ?? "";
  const to = latestDates.at(-1) ?? from;
  const countryOptions = unique(metadataRows
    .map((row) => row.country)
    .filter((country): country is string => Boolean(country)))
    .sort()
    .map((country) => ({ label: country, value: country }));
  const disciplineOptions = [
    { label: "Horse", value: "horse" },
    { label: "Harness", value: "harness" },
    { label: "Greyhound", value: "greyhound" },
  ].filter((option) => metadataRows.some((row) => row.race_code === option.value));
  const courseOptionsByCountry = buildCourseOptionsByCountry(metadataRows);

  return {
    countryOptions,
    courseOptionsByCountry,
    dateOptions: dates.map((date) => ({
      label: formatDateLabel(date),
      value: date,
    })),
    defaultDateRange: {
      from,
      to,
    },
    disciplineOptions,
    latestWindowLabel: dates.length
      ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}`
      : "No prediction dates",
    latestWindowRangeLabel: from
      ? `Default shows latest ${DEFAULT_PREDICTION_HISTORY_ROW_LIMIT} predictions. Date reset covers latest ${latestDates.length} prediction dates: ${formatDateLabel(from)} - ${formatDateLabel(to)}`
      : "No prediction history loaded from Supabase.",
  };
}

/**
 * Reads stored prediction-performance aggregates and filtered row history for the Predictions tab.
 */
export async function fetchPredictionStats(
  filters: PredictionHistoryFilters,
  predictionModel: PredictionModelKey = DEFAULT_PREDICTION_MODEL_KEY,
  performanceFilters: PredictionPerformanceFilters = {
    discipline: "all",
    rank: "all",
    signal: "all",
  },
): Promise<PredictionsData> {
  const [rows, performanceSummary, historyResult] = await Promise.all([
    supabaseSelect<PredictionAggregateRow>("prediction_aggregates", {
      order: "scope_type.asc,race_code.asc",
      prediction_model: `eq.${predictionModel}`,
      select: PREDICTION_AGGREGATE_SELECT,
    }),
    fetchPredictionPerformanceSummary(predictionModel, performanceFilters),
    fetchPredictionHistoryEntries(filters, predictionModel),
  ]);
  const disciplineRows = rows.filter((row) => row.scope_type === "race_code");

  return {
    disciplineReturns: disciplineRows.map(mapDisciplineReturn),
    history: historyResult.history,
    summaryStats: performanceSummary && performanceSummary.prediction_count > 0
      ? mapSummaryStats(performanceSummary)
      : [],
    totalHistoryCount: historyResult.totalCount,
  };
}

/**
 * Reads the filtered Stored model performance summary from the source prediction rows.
 */
async function fetchPredictionPerformanceSummary(
  predictionModel: PredictionModelKey,
  filters: PredictionPerformanceFilters,
) {
  const rows = await supabaseRpc<PredictionPerformanceSummaryRow[]>(
    "get_prediction_performance_summary",
    {
      p_max_rank: filters.rank === "all" ? null : Number(filters.rank),
      p_prediction_model: predictionModel,
      p_race_code: filters.discipline === "all" ? null : filters.discipline,
      p_signal_filter: filters.signal,
    },
  );

  return rows[0] ?? null;
}

/**
 * Returns course filter options scoped to the selected country.
 */
export function getPredictionHistoryCourseOptions(
  metadata: PredictionHistoryMetadata | null,
  country: string,
) {
  if (!metadata) {
    return [];
  }

  return metadata.courseOptionsByCountry.get(country) ?? [];
}

/**
 * Creates the initial Prediction history filters from Supabase metadata.
 */
export function createDefaultPredictionHistoryFilters(
  metadata: PredictionHistoryMetadata,
): PredictionHistoryFilters {
  return {
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: metadata.defaultDateRange.from,
    toDate: metadata.defaultDateRange.to,
  };
}

/**
 * Reads filtered prediction history rows from Supabase with a visible row-count.
 */
async function fetchPredictionHistoryEntries(
  filters: PredictionHistoryFilters,
  predictionModel: PredictionModelKey,
) {
  const params: Record<string, string> = {
    limit: String(DEFAULT_PREDICTION_HISTORY_ROW_LIMIT),
    offset: "0",
    order: "advertised_start.desc.nullslast,predicted_at.desc",
    prediction_model: `eq.${predictionModel}`,
    select: PREDICTION_HISTORY_SELECT,
  };

  if (filters.fromDate) {
    params.source_date = `gte.${filters.fromDate}`;
  }

  if (filters.toDate) {
    params.and = `(source_date.gte.${filters.fromDate},source_date.lte.${filters.toDate})`;
    delete params.source_date;
  }

  if (filters.country !== "all") {
    params.country = `eq.${filters.country}`;
  }

  if (filters.discipline !== "all") {
    params.race_code = `eq.${filters.discipline}`;
  }

  if (filters.course !== "all") {
    params.course_slug = `eq.${filters.course}`;
  }

  const { count, rows } = await supabaseSelectWithCount<PredictionHistoryRow>(
    "promotion_predictions",
    params,
  );

  return {
    history: rows.map(mapPredictionHistoryItem),
    totalCount: count ?? rows.length,
  };
}

/**
 * Reads matching Supabase rows using public PostgREST access.
 */
async function supabaseSelect<TRow>(table: string, params: Record<string, string>) {
  const { rows } = await supabaseSelectWithCount<TRow>(table, params, false);

  return rows;
}

/**
 * Reads matching Supabase rows and optionally asks PostgREST for exact count metadata.
 */
async function supabaseSelectWithCount<TRow>(
  table: string,
  params: Record<string, string>,
  includeCount = true,
) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
      ...(includeCount ? { prefer: "count=exact" } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase prediction read failed with HTTP ${response.status}`);
  }

  return {
    count: includeCount ? parseContentRangeCount(response.headers.get("content-range")) : null,
    rows: await response.json() as TRow[],
  };
}

/**
 * Calls a PostgREST RPC using the public Supabase key.
 */
async function supabaseRpc<TResult>(name: string, body: Record<string, unknown>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/rpc/${name}`, publicEnv.supabaseUrl);
  const response = await fetch(url.toString(), {
    body: JSON.stringify(body),
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Supabase prediction RPC ${name} failed with HTTP ${response.status}`);
  }

  return await response.json() as TResult;
}

/**
 * Converts a stored prediction race-code aggregate into the same return metrics used by Insights.
 */
function mapDisciplineReturn(row: PredictionSummaryMetrics & { race_code: string | null }): DisciplineReturn {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    bonusAverageReturn: formatReturn(bonusAverage(row)),
    bonusCredit: formatCurrency(numeric(row.total_bonus_credit)),
    bonusHitRate: formatPercentage(numeric(row.bonus_credit_percentage)),
    discipline: toTitleCase(row.race_code ?? "Unknown"),
    missingPrices: row.missing_result_count + row.missing_runner_count,
    netReturn: formatCurrency(numeric(row.net_return)),
    promoAverageReturn: formatReturn(numeric(row.average_value_per_dollar_with_bonus_credit)),
    promoNetReturn: formatCurrency(
      numeric(row.total_value_with_bonus_credit) - numeric(row.total_stake),
    ),
    promoRoi: formatPercentage(promoRoi(row)),
    roi: formatPercentage(numeric(row.roi_percentage)),
    totalPromoValue: formatCurrency(numeric(row.total_value_with_bonus_credit)),
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Builds all-country and country-scoped course options from prediction rows.
 */
function buildCourseOptionsByCountry(rows: {
  country: string | null;
  course_name: string | null;
  course_slug: string | null;
}[]) {
  const byCountry = new Map<string, Map<string, RaceFilterOption>>();

  for (const row of rows) {
    if (!row.course_slug || !row.course_name) {
      continue;
    }

    const countries = ["all"];

    if (row.country) {
      countries.push(row.country);
    }

    for (const country of countries) {
      const courses = byCountry.get(country) ?? new Map<string, RaceFilterOption>();
      courses.set(row.course_slug, {
        label: row.course_name,
        value: row.course_slug,
      });
      byCountry.set(country, courses);
    }
  }

  return new Map(Array.from(byCountry.entries()).map(([country, courses]) => [
    country,
    Array.from(courses.values()).sort((left, right) => left.label.localeCompare(right.label)),
  ]));
}

function mapSummaryStats(row: PredictionSummaryMetrics): FavouriteStat[] {
  return [
    {
      detail: `${row.settled_count} settled · ${row.pending_count} pending`,
      label: "Predictions",
      value: String(row.prediction_count),
    },
    {
      detail: `${row.wins} wins from ${row.settled_count} settled`,
      label: "Win rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} cash · ${formatCurrency(numeric(row.total_bonus_credit))} bonus`,
      label: "Cash+bonus avg",
      value: formatReturn(numeric(row.average_value_per_dollar_with_bonus_credit)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} cash returned on ${formatCurrency(numeric(row.total_stake))} staked`,
      label: "Cash avg",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} cash returned on ${formatCurrency(numeric(row.total_stake))} staked`,
      label: "Cash net",
      value: formatCurrency(numeric(row.net_return)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_value_with_bonus_credit))} cash+bonus value on ${formatCurrency(numeric(row.total_stake))} staked`,
      label: "Cash+bonus net",
      value: formatCurrency(
        numeric(row.total_value_with_bonus_credit) - numeric(row.total_stake),
      ),
    },
    {
      detail: `${row.missing_result_count} missing results · ${row.missing_runner_count} missing runners`,
      label: "Open issues",
      value: String(row.missing_result_count + row.missing_runner_count),
    },
  ];
}

/**
 * Converts one stored prediction row into a compact history item for display.
 */
function mapPredictionHistoryItem(row: PredictionHistoryRow): PredictionHistoryItem {
  const rankLabel = row.rank ? `Rank ${row.rank}` : "Unranked";
  const sampleLabel = row.historical_sample_size ? `${row.historical_sample_size} samples` : "No sample count";
  const starterCount = row.outcome_starter_count ?? row.predicted_starter_count;

  return {
    bonusCredit: formatCurrency(numeric(row.outcome_bonus_credit)),
    cashReturn: formatCurrency(numeric(row.outcome_win_return)),
    country: row.country ?? "Unknown country",
    discipline: toTitleCase(row.race_code),
    historyDetail: [
      row.course_name ?? "Unknown track",
      row.country ?? null,
      starterCount ? `${starterCount} starters` : null,
    ].filter(Boolean).join(" · "),
    id: row.id,
    outcomeLabel: describeOutcome(row),
    outcomeTone: getOutcomeTone(row),
    predictedAtLabel: `Predicted ${formatDateTime(row.predicted_at)}`,
    predictionMeta: [
      rankLabel,
      `Price ${formatPrice(row.predicted_fixed_win_price)}`,
      sampleLabel,
    ].join(" · "),
    raceLabel: [
      row.course_name ?? "Unknown track",
      row.race_number ? `R${row.race_number}` : null,
      row.race_name ?? null,
    ].filter(Boolean).join(" · "),
    runnerLabel: [
      row.predicted_runner_number ? `#${row.predicted_runner_number}` : null,
      row.predicted_runner_name ?? "Unknown runner",
    ].filter(Boolean).join(" "),
    signalLabel: row.signal_label ?? "Stored prediction",
    startLabel: row.advertised_start ? formatDateTime(row.advertised_start) : formatDateLabel(row.source_date),
    totalValue: formatCurrency(numeric(row.outcome_total_value_with_bonus_credit)),
  };
}

function describeOutcome(row: PredictionHistoryRow) {
  if (row.outcome_status === "settled") {
    return row.outcome_result_position
      ? `${ordinal(row.outcome_result_position)} · ${formatCurrency(numeric(row.outcome_total_value_with_bonus_credit))} value`
      : `Settled · ${formatCurrency(numeric(row.outcome_total_value_with_bonus_credit))} value`;
  }

  if (row.outcome_status === "pending") {
    return "Pending result";
  }

  if (row.outcome_status === "missing_runner") {
    return "Missing runner match";
  }

  if (row.outcome_status === "race_not_found") {
    return "Race not found";
  }

  return "Missing result";
}

function getOutcomeTone(row: PredictionHistoryRow): PredictionHistoryItem["outcomeTone"] {
  if (row.outcome_status === "settled") {
    return numeric(row.outcome_total_value_with_bonus_credit) > 0 ? "good" : "default";
  }

  return row.outcome_status === "pending" ? "warning" : "default";
}

function numeric(value: NullableNumber) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseContentRangeCount(value: string | null) {
  const match = value?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function unique<TValue>(values: TValue[]) {
  return Array.from(new Set(values));
}

function bonusAverage(row: PredictionSummaryMetrics) {
  return numeric(row.total_stake)
    ? numeric(row.total_bonus_credit) / numeric(row.total_stake)
    : 0;
}

function promoRoi(row: PredictionSummaryMetrics) {
  const totalStake = numeric(row.total_stake);

  if (!totalStake) {
    return 0;
  }

  return ((numeric(row.total_value_with_bonus_credit) - totalStake) / totalStake) * 100;
}

function formatCurrency(value: number) {
  const absoluteValue = Math.abs(value).toFixed(2);

  return value < 0 ? `-$${absoluteValue}` : `$${absoluteValue}`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

function formatPrice(value: NullableNumber) {
  const number = numeric(value);

  return number ? `$${number.toFixed(2)}` : "Unavailable";
}

function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatReturn(value: number) {
  return formatCurrency(value);
}

function ordinal(value: number) {
  const suffix = value % 10 === 1 && value % 100 !== 11
    ? "st"
    : value % 10 === 2 && value % 100 !== 12
      ? "nd"
      : value % 10 === 3 && value % 100 !== 13
        ? "rd"
        : "th";

  return `${value}${suffix}`;
}

function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}
