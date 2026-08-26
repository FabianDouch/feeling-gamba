import { publicEnv } from "../config/env";
import type { DisciplineReturn, FavouriteStat, RaceFilterOption } from "./collectedRaceDay";
import { supabaseClient } from "./supabaseClient";

type NullableNumber = number | string | null;
const DEFAULT_DATE_WINDOW_SIZE = 14;
export const DEFAULT_PREDICTION_HISTORY_ROW_LIMIT = 50;
export const DEFAULT_PREDICTION_MODEL_KEY = "global_bucket_blend_v1";
export const SINGLE_WIN_PERCENTAGE_60_PLUS_MODEL_KEY = "single_win_percentage_60_plus_v1";
export const SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY = "single_win_percentage_65_plus_v1";
export const WIN_PERCENTAGE_MULTI_MODEL_KEY = "multi_win_percentage_blend_v1";
export const WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY = "multi_win_percentage_60_plus_v1";
export const WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY = "multi_win_percentage_65_plus_v1";
export const PLACING_PERCENTAGE_MULTI_MODEL_KEY = "multi_place_percentage_v1";
export const UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY = "ufc_multi_favourite_price_win_percentage_v1";
export const UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY = "ufc_multi_other_fighter_price_win_percentage_v1";
export const UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY = "ufc_multi_price_difference_win_percentage_v1";
export const UFC_SINGLE_65_PLUS_MODEL_KEY = "ufc_single_win_percentage_65_plus_v1";
export const UFC_SINGLE_75_PLUS_MODEL_KEY = "ufc_single_win_percentage_75_plus_v1";
export const UFC_SINGLE_85_PLUS_MODEL_KEY = "ufc_single_win_percentage_85_plus_v1";
const SOURCE_TIME_ZONE = "Pacific/Auckland";

export type PredictionModelKey =
  | "global_bucket_blend_v1"
  | "global_bucket_cash_blend_v1"
  | "global_bucket_cash_even_blend_v1"
  | "global_bucket_cash_price_only_v1"
  | "global_bucket_cash_starter_only_v1"
  | "global_other_starters_average_price_cash_v1"
  | "country_code_bucket_blend_shrunk_v1"
  | "country_code_distance_condition_v1"
  | typeof SINGLE_WIN_PERCENTAGE_60_PLUS_MODEL_KEY
  | typeof SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY;

export type PredictionPerformanceDisciplineFilter = "all" | "horse" | "harness" | "greyhound";
export type PredictionPerformanceRankFilter = "all" | "1" | "2" | "3";
export type PredictionPerformanceSignalFilter = "all" | "positive_only" | "neutral_or_better";
export type PredictionStatsFormat = "multis" | "singles";
export type PredictionStatsSport = "racing" | "ufc";
export type WinPercentageMultiRankFilter = "all" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
export type WinPercentageMultiModelKey =
  | typeof WIN_PERCENTAGE_MULTI_MODEL_KEY
  | typeof WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY
  | typeof WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY
  | typeof PLACING_PERCENTAGE_MULTI_MODEL_KEY
  | typeof UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY
  | typeof UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY
  | typeof UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY
  | typeof UFC_SINGLE_65_PLUS_MODEL_KEY
  | typeof UFC_SINGLE_75_PLUS_MODEL_KEY
  | typeof UFC_SINGLE_85_PLUS_MODEL_KEY;

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

export type WinPercentageMultiModelVariant = {
  description: string;
  detail: string;
  key: WinPercentageMultiModelKey;
  label: string;
  sport: "racing" | "ufc";
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

export const CASH_PREDICTION_MODEL_VARIANTS = PREDICTION_MODEL_VARIANTS;

export const WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS: PredictionModelVariant[] = [
  {
    description: "Tracks every current racing favourite whose blended historical win score is at least 60%.",
    detail: "Score = 65% favourite price-bucket win rate plus 35% starter-count win rate. Each eligible runner is tracked as a separate $1 single outcome.",
    key: SINGLE_WIN_PERCENTAGE_60_PLUS_MODEL_KEY,
    label: "60%+ win singles",
  },
  {
    description: "Tracks every current racing favourite whose blended historical win score is at least 65%.",
    detail: "Score = 65% favourite price-bucket win rate plus 35% starter-count win rate. Each eligible runner is tracked as a separate $1 single outcome.",
    key: SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY,
    label: "65%+ win singles",
  },
];

export const WIN_PERCENTAGE_MULTI_MODEL_VARIANTS: WinPercentageMultiModelVariant[] = [
  {
    description: "Builds a three-to-five leg multi from Positive win-rate signals first, otherwise Positive-or-Neutral win-rate signals.",
    detail: "Score = 65% favourite price-bucket win rate plus 35% starter-count win rate. Positive starts at 50%, neutral starts at 40%.",
    key: WIN_PERCENTAGE_MULTI_MODEL_KEY,
    label: "Original win %",
    sport: "racing",
  },
  {
    description: "Builds a stricter multi from current favourites whose blended historical win score is at least 60%.",
    detail: "Score = 65% favourite price-bucket win rate plus 35% starter-count win rate. Eligible legs need a 60%+ score and the recommendation can include up to 10 legs.",
    key: WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
    label: "60%+ win %",
    sport: "racing",
  },
  {
    description: "Builds a stricter multi from current favourites whose blended historical win score is at least 65%.",
    detail: "Score = 65% favourite price-bucket win rate plus 35% starter-count win rate. Eligible legs need a 65%+ score and the recommendation can include up to 10 legs.",
    key: WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
    label: "65%+ win %",
    sport: "racing",
  },
  {
    description: "Builds a placing multi from current favourites with the strongest historical place-rate scores.",
    detail: "Score = 65% favourite price-bucket place rate plus 35% starter-count place rate. Eligible legs need an active place market and the recommendation can include up to 8 legs.",
    key: PLACING_PERCENTAGE_MULTI_MODEL_KEY,
    label: "Place % multi",
    sport: "racing",
  },
  {
    description: "Builds a UFC same-card multi from favourites ranked by the matching historical favourite price bucket win rate.",
    detail: "Score = historical UFC favourite win percentage for the current favourite fixed-win price bucket. Eligible legs must be Head to Head fights on the same UFC card.",
    key: UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
    label: "UFC fav price",
    sport: "ufc",
  },
  {
    description: "Builds a UFC same-card multi from favourites ranked by the opponent's historical price bucket win rate.",
    detail: "Score = historical UFC favourite win percentage for the other fighter's fixed-win price bucket. Eligible legs must be Head to Head fights on the same UFC card.",
    key: UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
    label: "UFC other price",
    sport: "ufc",
  },
  {
    description: "Builds a UFC same-card multi from favourites ranked by the historical price-difference bucket win rate.",
    detail: "Score = historical UFC favourite win percentage for the difference between the other fighter price and favourite price. Eligible legs must be Head to Head fights on the same UFC card.",
    key: UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
    label: "UFC price diff",
    sport: "ufc",
  },
  {
    description: "Tracks each current UFC favourite whose strongest historical UFC win-percentage signal is at least 65%.",
    detail: "Each fully priced Head to Head favourite is scored across the UFC favourite-price, other-fighter-price, and price-difference models. The strongest 65%+ signal is tracked as a separate $1 single.",
    key: UFC_SINGLE_65_PLUS_MODEL_KEY,
    label: "65%+ win singles",
    sport: "ufc",
  },
  {
    description: "Tracks each current UFC favourite whose strongest historical UFC win-percentage signal is at least 75%.",
    detail: "Each fully priced Head to Head favourite is scored across the UFC favourite-price, other-fighter-price, and price-difference models. The strongest 75%+ signal is tracked as a separate $1 single.",
    key: UFC_SINGLE_75_PLUS_MODEL_KEY,
    label: "75%+ win singles",
    sport: "ufc",
  },
  {
    description: "Tracks each current UFC favourite whose strongest historical UFC win-percentage signal is at least 85%.",
    detail: "Each fully priced Head to Head favourite is scored across the UFC favourite-price, other-fighter-price, and price-difference models. The strongest 85%+ signal is tracked as a separate $1 single.",
    key: UFC_SINGLE_85_PLUS_MODEL_KEY,
    label: "85%+ win singles",
    sport: "ufc",
  },
];

export const RACING_WIN_PERCENTAGE_MULTI_MODEL_VARIANTS = WIN_PERCENTAGE_MULTI_MODEL_VARIANTS
  .filter((model) => model.sport === "racing");
export const UFC_WIN_PERCENTAGE_MULTI_MODEL_VARIANTS = WIN_PERCENTAGE_MULTI_MODEL_VARIANTS
  .filter((model) => model.sport === "ufc");

type PredictionSummaryMetrics = {
  average_return_per_dollar: NullableNumber;
  average_value_per_dollar_with_bonus_credit: NullableNumber;
  bonus_credit_percentage: NullableNumber;
  missing_result_count: number;
  missing_runner_count: number;
  net_return: NullableNumber;
  pending_count: number;
  missing_place_return_count?: number;
  place_average_return_per_dollar?: NullableNumber;
  place_eligible_count?: number;
  place_net_return?: NullableNumber;
  place_percentage?: NullableNumber;
  place_roi_percentage?: NullableNumber;
  places?: number;
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
  total_place_return?: NullableNumber;
  total_place_stake?: NullableNumber;
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

type PredictionHistorySummaryRow = PredictionSummaryMetrics & {
  country: string | null;
  course_slug: string | null;
  date_from: string | null;
  date_to: string | null;
  race_code: string | null;
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

type PredictionHistoryEntryRow = PredictionHistoryRow & {
  total_count: number | null;
};

type MultiBetRecommendationSummaryRow = {
  average_return_per_dollar: NullableNumber;
  date_from: string | null;
  date_to: string | null;
  missing_result_count: number;
  missing_runner_count: number;
  net_return: NullableNumber;
  pending_count: number;
  prediction_count: number;
  prediction_model: string | null;
  recommendation_type: string | null;
  roi_percentage: NullableNumber;
  settled_count: number;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  win_percentage: NullableNumber;
  wins: number;
};

type MultiBetRecommendationLegRow = {
  advertisedStart: string | null;
  cashAverageScore: NullableNumber;
  country: string | null;
  courseName: string | null;
  legIndex: number | null;
  outcomeResultPosition: number | null;
  outcomeStatus: "pending" | "settled" | "race_not_found" | "missing_runner" | "missing_result";
  outcomeWinReturn: NullableNumber;
  placePayoutDepth?: number | null;
  predictedFixedPlacePrice?: NullableNumber;
  predictedFixedWinPrice: NullableNumber;
  predictedRunnerName: string | null;
  predictedRunnerNumber: number | null;
  predictionRank: number | null;
  raceCode: string | null;
  raceName: string | null;
  raceNumber: number | null;
  signalLabel: string | null;
  signalTone: string | null;
  sourceRaceCardId: string;
};

type MultiBetRecommendationHistoryRow = {
  average_cash_score: NullableNumber;
  combined_fixed_place_price?: NullableNumber;
  combined_fixed_win_price: NullableNumber;
  id: string;
  leg_count: number;
  legs: MultiBetRecommendationLegRow[];
  outcome_missing_result_count: number;
  outcome_missing_runner_count: number;
  outcome_settled_leg_count: number;
  outcome_status: "pending" | "settled" | "race_not_found" | "missing_runner" | "missing_result";
  outcome_win_return: NullableNumber;
  outcome_winning_leg_count: number;
  predicted_at: string;
  prediction_model: string | null;
  recommendation_type: "neutral" | "positive";
  source_date: string;
  total_count: number | null;
};

type MultiBetRecommendationMetadataRow = {
  multi_bet_recommendation_legs?: {
    country: string | null;
    course_name: string | null;
    course_slug: string | null;
    race_code: string | null;
  }[] | null;
  source_date: string;
};

type LockedMultiRecommendationMetadataRow = {
  legs: unknown[] | null;
  source_date: string;
};

type UfcMultiRecommendationLegRow = {
  advertisedStart: string | null;
  bucketLabel: string | null;
  bucketSampleSize: number | null;
  bucketWinPercentage: NullableNumber;
  legIndex: number | null;
  otherFighterName: string | null;
  otherFixedWinPrice: NullableNumber;
  outcomeResultPosition: number | null;
  outcomeStatus: "pending" | "settled" | "missing_result";
  outcomeWinReturn: NullableNumber;
  predictedFighterName: string | null;
  predictedFixedWinPrice: NullableNumber;
  predictionRank: number | null;
  priceDifference: NullableNumber;
  signalLabel: string | null;
  signalTone: string | null;
  sourceEventId: string;
  winScore: NullableNumber;
};

type UfcMultiRecommendationHistoryRow = {
  average_win_score: NullableNumber;
  combined_fixed_win_price: NullableNumber;
  id: string;
  leg_count: number;
  legs: UfcMultiRecommendationLegRow[];
  outcome_missing_result_count: number;
  outcome_settled_leg_count: number;
  outcome_status: "pending" | "settled" | "missing_result";
  outcome_win_return: NullableNumber;
  outcome_winning_leg_count: number;
  predicted_at: string;
  prediction_model: string | null;
  recommendation_type: "neutral" | "positive";
  source_card_name: string | null;
  source_date: string;
  total_count: number | null;
};

type UfcSinglePredictionHistoryRow = {
  advertised_start: string | null;
  bucket_label: string | null;
  bucket_sample_size: number | null;
  bucket_win_percentage: NullableNumber;
  fight_name: string | null;
  id: string;
  other_fighter_fixed_win_price: NullableNumber;
  other_fighter_name: string | null;
  outcome_favourite_won: boolean | null;
  outcome_status: "pending" | "settled" | "missing_result";
  outcome_win_return: NullableNumber;
  outcome_winner_name: string | null;
  predicted_at: string;
  predicted_fighter_name: string | null;
  predicted_fixed_win_price: NullableNumber;
  prediction_model: string | null;
  prediction_rank: number | null;
  price_difference: NullableNumber;
  signal_label: string | null;
  signal_tone: string | null;
  source_card_name: string | null;
  source_date: string;
  source_event_id: string;
  source_market_id: string | null;
  total_count: number | null;
  win_score: NullableNumber;
};

export type PredictionHistoryItem = {
  bonusCredit: string;
  cashReturn: string;
  country: string;
  discipline: string;
  historyDetail: string;
  id: string;
  outcomeLabel: string;
  outcomeTone: "bonus" | "default" | "good" | "warning";
  predictedAtLabel: string;
  predictionMeta: string;
  raceLabel: string;
  runnerLabel: string;
  signalLabel: string;
  startLabel: string;
  totalValue: string;
};

export type MultiBetRecommendationLegItem = {
  id: string;
  metaLabel: string;
  outcomeLabel: string;
  outcomeTone: "default" | "good" | "warning";
  raceCode: string | null;
  runnerLabel: string;
  scoreLabel: string;
  title: string;
};

export type MultiBetRecommendationHistoryItem = {
  averageCashScore: string;
  averageScoreLabel: string;
  combinedFixedPlacePrice: string;
  combinedFixedWinPrice: string;
  id: string;
  legs: MultiBetRecommendationLegItem[];
  outcomeLabel: string;
  outcomeTone: "default" | "good" | "warning";
  predictedAtLabel: string;
  recommendationLabel: string;
  returnLabel: string;
  sourceDate: string;
  sourceDateLabel: string;
  summaryLabel: string;
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
  historySummaryStats: FavouriteStat[];
  multiBetHistory: MultiBetRecommendationHistoryItem[];
  multiBetPerformanceStats: FavouriteStat[];
  multiBetSummaryStats: FavouriteStat[];
  placingPerformanceStats: FavouriteStat[];
  summaryStats: FavouriteStat[];
  totalMultiBetHistoryCount: number;
  totalHistoryCount: number;
  totalWinPercentageMultiBetHistoryCount: number;
  winPercentageMultiBetHistory: MultiBetRecommendationHistoryItem[];
  winPercentageMultiBetPerformanceStats: FavouriteStat[];
  winPercentageMultiBetSummaryStats: FavouriteStat[];
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
 * Reads model keys that have a tracked multi-bet prediction for today's source date.
 */
export async function fetchMultiBetRecommendationModelKeys(): Promise<PredictionModelKey[]> {
  try {
    const today = getTodaySourceDate();
    const rows = await supabaseSelect<{ prediction_model: string | null }>("multi_bet_recommendations", {
      order: "prediction_model.asc",
      select: "prediction_model",
      source_date: `eq.${today}`,
    });
    const knownModels = new Set(PREDICTION_MODEL_VARIANTS.map((model) => model.key));

    return unique(rows
      .map((row) => row.prediction_model)
      .filter((model): model is PredictionModelKey =>
        Boolean(model && knownModels.has(model as PredictionModelKey))));
  } catch (error) {
    if (isMissingRpcError(error) || isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
}

/**
 * Reads model-scoped metadata used to build Prediction history filters without loading every row.
 */
export async function fetchPredictionHistoryMetadata(
  predictionModel: PredictionModelKey = DEFAULT_PREDICTION_MODEL_KEY,
): Promise<PredictionHistoryMetadata> {
  const dateRows = await supabaseSelect<{ source_date: string }>("promotion_predictions", {
    order: "source_date.desc",
    prediction_model: `eq.${predictionModel}`,
    select: "source_date",
  });
  const metadataRows = await supabaseSelect<{
    country: string | null;
    course_name: string | null;
    course_slug: string | null;
    race_code: string | null;
  }>("promotion_predictions", {
    order: "country.asc,course_name.asc,race_code.asc",
    prediction_model: `eq.${predictionModel}`,
    select: "country,course_name,course_slug,race_code",
  });
  const yesterday = getYesterdaySourceDate();
  const dates = unique([...dateRows.map((row) => row.source_date), yesterday]).sort();
  const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);
  const from = yesterday;
  const to = yesterday;
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
    latestWindowRangeLabel: yesterday
      ? `Default date range is yesterday in NZ time: ${formatDateLabel(yesterday)}. Available prediction dates span ${latestDates.length ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}` : "none"}.`
      : "No prediction history loaded from Supabase.",
  };
}

/**
 * Reads racing percentage multi metadata from tracked multi rows instead of single-prediction rows.
 */
export async function fetchRacingMultiBetRecommendationHistoryMetadata(
  predictionModel: WinPercentageMultiModelKey = WIN_PERCENTAGE_MULTI_MODEL_KEY,
): Promise<PredictionHistoryMetadata> {
  const yesterday = getYesterdaySourceDate();

  try {
    const dateRows = await supabaseSelect<{ source_date: string }>("multi_bet_recommendations", {
      order: "source_date.desc",
      prediction_model: `eq.${predictionModel}`,
      select: "source_date",
    });
    let metadataRows: {
      country: string | null;
      course_name: string | null;
      course_slug: string | null;
      race_code: string | null;
    }[] = [];

    try {
      const parentRows = await supabaseSelect<MultiBetRecommendationMetadataRow>("multi_bet_recommendations", {
        order: "source_date.desc",
        prediction_model: `eq.${predictionModel}`,
        select: "source_date,multi_bet_recommendation_legs(country,course_name,course_slug,race_code)",
      });
      metadataRows = parentRows.flatMap((row) => row.multi_bet_recommendation_legs ?? []);
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    const lockedMetadataRows = await fetchUserLockedMultiMetadataRows(predictionModel);
    const lockedLegMetadataRows = lockedMetadataRows.flatMap((row) =>
      (row.legs ?? []).map(mapLockedMultiMetadataLeg).filter((leg): leg is {
        country: string | null;
        course_name: string | null;
        course_slug: string | null;
        race_code: string | null;
      } => Boolean(leg)));
    const dates = unique([
      ...dateRows.map((row) => row.source_date),
      ...lockedMetadataRows.map((row) => row.source_date),
      yesterday,
    ]).sort();
    const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);
    const combinedMetadataRows = [...metadataRows, ...lockedLegMetadataRows];
    const countryOptions = unique(combinedMetadataRows
      .map((row) => row.country)
      .filter((country): country is string => Boolean(country)))
      .sort()
      .map((country) => ({ label: country, value: country }));
    const disciplineOptions = [
      { label: "Horse", value: "horse" },
      { label: "Harness", value: "harness" },
      { label: "Greyhound", value: "greyhound" },
    ].filter((option) => combinedMetadataRows.some((row) => row.race_code === option.value));
    const courseOptionsByCountry = buildCourseOptionsByCountry(combinedMetadataRows);

    return {
      countryOptions,
      courseOptionsByCountry,
      dateOptions: dates.map((date) => ({
        label: formatDateLabel(date),
        value: date,
      })),
      defaultDateRange: {
        from: yesterday,
        to: yesterday,
      },
      disciplineOptions,
      latestWindowLabel: dates.length
        ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}`
        : "No racing multi dates",
      latestWindowRangeLabel: `Default date range is yesterday in NZ time: ${formatDateLabel(yesterday)}. Available racing multi dates span ${latestDates.length ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}` : "none"}.`,
    };
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    return {
      countryOptions: [],
      courseOptionsByCountry: new Map(),
      dateOptions: [{
        label: formatDateLabel(yesterday),
        value: yesterday,
      }],
      defaultDateRange: {
        from: yesterday,
        to: yesterday,
      },
      disciplineOptions: [],
      latestWindowLabel: "No racing multi dates",
      latestWindowRangeLabel: "Racing multi prediction history is not deployed yet.",
    };
  }
}

/**
 * Reads UFC multi history dates without racing-only country, discipline, or course filters.
 */
export async function fetchUfcPredictionHistoryMetadata(
  predictionModel: WinPercentageMultiModelKey = UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  format: PredictionStatsFormat = "multis",
): Promise<PredictionHistoryMetadata> {
  const yesterday = getYesterdaySourceDate();
  const tableName = format === "singles" ? "ufc_single_predictions" : "ufc_multi_recommendations";

  try {
    const dateRows = await supabaseSelect<{ source_date: string }>(tableName, {
      order: "source_date.desc",
      prediction_model: `eq.${predictionModel}`,
      select: "source_date",
    });
    const dates = unique([...dateRows.map((row) => row.source_date), yesterday]).sort();
    const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);

    return {
      countryOptions: [],
      courseOptionsByCountry: new Map(),
      dateOptions: dates.map((date) => ({
        label: formatDateLabel(date),
        value: date,
      })),
      defaultDateRange: {
        from: yesterday,
        to: yesterday,
      },
      disciplineOptions: [],
      latestWindowLabel: dates.length
        ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}`
        : "No UFC prediction dates",
      latestWindowRangeLabel: `Default date range is yesterday in NZ time: ${formatDateLabel(yesterday)}. Available UFC prediction dates span ${latestDates.length ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates.at(-1) ?? dates[0])}` : "none"}.`,
    };
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    return {
      countryOptions: [],
      courseOptionsByCountry: new Map(),
      dateOptions: [{
        label: formatDateLabel(yesterday),
        value: yesterday,
      }],
      defaultDateRange: {
        from: yesterday,
        to: yesterday,
      },
      disciplineOptions: [],
      latestWindowLabel: "No UFC prediction dates",
      latestWindowRangeLabel: "UFC prediction history is not deployed yet.",
    };
  }
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
  winPercentageMultiRankFilter: WinPercentageMultiRankFilter = "all",
  winPercentageMultiModel: WinPercentageMultiModelKey = WIN_PERCENTAGE_MULTI_MODEL_KEY,
  sport: PredictionStatsSport = "racing",
  format: PredictionStatsFormat = "multis",
): Promise<PredictionsData> {
  const winPercentageMaxLegRank = winPercentageMultiRankFilter === "all"
    ? null
    : Number(winPercentageMultiRankFilter);

  if (sport === "ufc") {
    const ufcWinPercentageMultiModel = isUfcPercentageMultiModel(winPercentageMultiModel)
      ? winPercentageMultiModel
      : UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY;

    if (format === "singles") {
      const [
        performanceSummary,
        historySummary,
        historyResult,
      ] = await Promise.all([
        fetchUfcSinglePredictionPerformanceSummary(ufcWinPercentageMultiModel),
        fetchUfcSinglePredictionSummary(filters, ufcWinPercentageMultiModel),
        fetchUfcSinglePredictionEntries(filters, ufcWinPercentageMultiModel),
      ]);

      return {
        disciplineReturns: [],
        history: historyResult.history,
        historySummaryStats: historySummary && historySummary.prediction_count > 0
          ? mapUfcSinglePredictionSummaryStats(historySummary, "UFC single date range")
          : [],
        multiBetHistory: [],
        multiBetPerformanceStats: [],
        multiBetSummaryStats: [],
        placingPerformanceStats: [],
        summaryStats: performanceSummary && performanceSummary.prediction_count > 0
          ? mapUfcSinglePredictionSummaryStats(performanceSummary, getUfcWinPercentageSinglePredictionLabel(ufcWinPercentageMultiModel))
          : [],
        totalHistoryCount: historyResult.totalCount,
        totalMultiBetHistoryCount: 0,
        totalWinPercentageMultiBetHistoryCount: 0,
        winPercentageMultiBetHistory: [],
        winPercentageMultiBetPerformanceStats: [],
        winPercentageMultiBetSummaryStats: [],
      };
    }

    const [
      winPercentageMultiBetPerformanceSummary,
      winPercentageMultiBetSummary,
      winPercentageMultiBetHistoryResult,
    ] = await Promise.all([
      fetchUfcMultiRecommendationPerformanceSummary(ufcWinPercentageMultiModel, winPercentageMaxLegRank),
      fetchUfcMultiRecommendationSummary(filters, ufcWinPercentageMultiModel, winPercentageMaxLegRank),
      fetchUfcMultiRecommendationEntries(filters, ufcWinPercentageMultiModel, winPercentageMaxLegRank),
    ]);

    return {
      disciplineReturns: [],
      history: [],
      historySummaryStats: [],
      multiBetHistory: [],
      multiBetPerformanceStats: [],
      multiBetSummaryStats: [],
      placingPerformanceStats: [],
      summaryStats: [],
      totalHistoryCount: 0,
      totalMultiBetHistoryCount: 0,
      totalWinPercentageMultiBetHistoryCount: winPercentageMultiBetHistoryResult.totalCount,
      winPercentageMultiBetHistory: winPercentageMultiBetHistoryResult.history,
      winPercentageMultiBetPerformanceStats: winPercentageMultiBetPerformanceSummary && winPercentageMultiBetPerformanceSummary.prediction_count > 0
        ? mapMultiBetSummaryStats(winPercentageMultiBetPerformanceSummary, getWinPercentageMultiPredictionLabel(ufcWinPercentageMultiModel))
        : [],
      winPercentageMultiBetSummaryStats: winPercentageMultiBetSummary && winPercentageMultiBetSummary.prediction_count > 0
        ? mapMultiBetSummaryStats(winPercentageMultiBetSummary, getWinPercentageMultiPredictionLabel(ufcWinPercentageMultiModel))
        : [],
    };
  }

  const isUfcWinPercentageModel = isUfcPercentageMultiModel(winPercentageMultiModel);
  const fetchWinPercentagePerformanceSummary = isUfcWinPercentageModel
    ? fetchUfcMultiRecommendationPerformanceSummary
    : fetchUserAwareRacingMultiBetRecommendationPerformanceSummary;
  const fetchWinPercentageSummary = isUfcWinPercentageModel
    ? fetchUfcMultiRecommendationSummary
    : fetchUserAwareRacingMultiBetRecommendationSummary;
  const fetchWinPercentageEntries = isUfcWinPercentageModel
    ? fetchUfcMultiRecommendationEntries
    : fetchUserAwareRacingMultiBetRecommendationEntries;
  const [
    rows,
    performanceSummary,
    historySummary,
    historyResult,
    multiBetPerformanceSummary,
    multiBetSummary,
    multiBetHistoryResult,
    winPercentageMultiBetPerformanceSummary,
    winPercentageMultiBetSummary,
    winPercentageMultiBetHistoryResult,
  ] = await Promise.all([
    supabaseSelect<PredictionAggregateRow>("prediction_aggregates", {
      order: "scope_type.asc,race_code.asc",
      prediction_model: `eq.${predictionModel}`,
      select: PREDICTION_AGGREGATE_SELECT,
    }),
    fetchPredictionPerformanceSummary(predictionModel, performanceFilters),
    fetchPredictionHistorySummary(filters, predictionModel),
    fetchPredictionHistoryEntries(filters, predictionModel),
    fetchMultiBetRecommendationPerformanceSummary(predictionModel),
    fetchMultiBetRecommendationSummary(filters, predictionModel),
    fetchMultiBetRecommendationEntries(filters, predictionModel),
    fetchWinPercentagePerformanceSummary(winPercentageMultiModel, winPercentageMaxLegRank),
    fetchWinPercentageSummary(filters, winPercentageMultiModel, winPercentageMaxLegRank),
    fetchWinPercentageEntries(filters, winPercentageMultiModel, winPercentageMaxLegRank),
  ]);
  const disciplineRows = rows.filter((row) => row.scope_type === "race_code");

  return {
    disciplineReturns: disciplineRows.map(mapDisciplineReturn),
    history: historyResult.history,
    historySummaryStats: historySummary && historySummary.prediction_count > 0
      ? mapSummaryStats(historySummary)
      : [],
    multiBetHistory: multiBetHistoryResult.history,
    multiBetPerformanceStats: multiBetPerformanceSummary && multiBetPerformanceSummary.prediction_count > 0
      ? mapMultiBetSummaryStats(multiBetPerformanceSummary)
      : [],
    multiBetSummaryStats: multiBetSummary && multiBetSummary.prediction_count > 0
      ? mapMultiBetSummaryStats(multiBetSummary)
      : [],
    placingPerformanceStats: performanceSummary && Number(performanceSummary.place_eligible_count ?? 0) > 0
      ? mapPlacingSummaryStats(performanceSummary)
      : [],
    summaryStats: performanceSummary && performanceSummary.prediction_count > 0
      ? mapSummaryStats(performanceSummary)
      : [],
    totalMultiBetHistoryCount: multiBetHistoryResult.totalCount,
    totalHistoryCount: historyResult.totalCount,
    totalWinPercentageMultiBetHistoryCount: winPercentageMultiBetHistoryResult.totalCount,
    winPercentageMultiBetHistory: winPercentageMultiBetHistoryResult.history,
    winPercentageMultiBetPerformanceStats: winPercentageMultiBetPerformanceSummary && winPercentageMultiBetPerformanceSummary.prediction_count > 0
      ? mapMultiBetSummaryStats(winPercentageMultiBetPerformanceSummary, getWinPercentageMultiPredictionLabel(winPercentageMultiModel))
      : [],
    winPercentageMultiBetSummaryStats: winPercentageMultiBetSummary && winPercentageMultiBetSummary.prediction_count > 0
      ? mapMultiBetSummaryStats(winPercentageMultiBetSummary, getWinPercentageMultiPredictionLabel(winPercentageMultiModel))
      : [],
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
 * Reads the selected Prediction history filter summary from all matching prediction rows.
 */
async function fetchPredictionHistorySummary(
  filters: PredictionHistoryFilters,
  predictionModel: PredictionModelKey,
) {
  const rows = await supabaseRpc<PredictionHistorySummaryRow[]>(
    "get_prediction_history_summary",
    {
      p_country: filters.country === "all" ? null : filters.country,
      p_course_slug: filters.course === "all" ? null : filters.course,
      p_from_date: filters.fromDate || null,
      p_prediction_model: predictionModel,
      p_race_code: filters.discipline === "all" ? null : filters.discipline,
      p_to_date: filters.toDate || null,
    },
  );

  return rows[0] ?? null;
}

/**
 * Reads cash-only summary stats for tracked multi-bet recommendations.
 */
async function fetchMultiBetRecommendationSummary(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  try {
    const body: Record<string, unknown> = {
      p_country: filters.country === "all" ? null : filters.country,
      p_course_slug: filters.course === "all" ? null : filters.course,
      p_from_date: filters.fromDate || null,
      p_prediction_model: predictionModel,
      p_race_code: filters.discipline === "all" ? null : filters.discipline,
      p_recommendation_type: null,
      p_to_date: filters.toDate || null,
    };

    if (maxLegRank !== null) {
      body.p_max_leg_rank = maxLegRank;
    }

    const rows = await supabaseRpc<MultiBetRecommendationSummaryRow[]>(
      "get_multi_bet_recommendation_summary",
      body,
    );

    return rows[0] ?? null;
  } catch (error) {
    if (isMissingRpcError(error)) {
      return null;
    }

    throw error;
  }
}

/**
 * Reads all-time tracked multi-bet recommendation performance for the selected model.
 */
async function fetchMultiBetRecommendationPerformanceSummary(
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  return fetchMultiBetRecommendationSummary({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  }, predictionModel, maxLegRank);
}

/**
 * Uses signed-in locked racing percentage multis when present, otherwise shared tracked recommendations.
 */
async function fetchUserAwareRacingMultiBetRecommendationSummary(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  return fetchMultiBetRecommendationSummary(filters, predictionModel, maxLegRank);
}

/**
 * Uses signed-in locked racing percentage multi performance when present.
 */
async function fetchUserAwareRacingMultiBetRecommendationPerformanceSummary(
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  return fetchUserAwareRacingMultiBetRecommendationSummary({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  }, predictionModel, maxLegRank);
}

/**
 * Reads UFC same-card multi summary stats for the selected model.
 */
async function fetchUfcMultiRecommendationSummary(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  try {
    const body: Record<string, unknown> = {
      p_from_date: filters.fromDate || null,
      p_prediction_model: predictionModel,
      p_to_date: filters.toDate || null,
    };

    if (maxLegRank !== null) {
      body.p_max_leg_rank = maxLegRank;
    }

    const rows = await supabaseRpc<MultiBetRecommendationSummaryRow[]>(
      "get_ufc_multi_recommendation_summary",
      body,
    );

    return rows[0] ?? null;
  } catch (error) {
    if (isMissingRpcError(error)) {
      return null;
    }

    throw error;
  }
}

/**
 * Reads all-time UFC same-card multi performance for the selected model.
 */
async function fetchUfcMultiRecommendationPerformanceSummary(
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  return fetchUfcMultiRecommendationSummary({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  }, predictionModel, maxLegRank);
}

/**
 * Reads UFC single summary stats for the selected model.
 */
async function fetchUfcSinglePredictionSummary(
  filters: PredictionHistoryFilters,
  predictionModel: string,
) {
  try {
    const rows = await supabaseRpc<MultiBetRecommendationSummaryRow[]>(
      "get_ufc_single_prediction_summary",
      {
        p_from_date: filters.fromDate || null,
        p_prediction_model: predictionModel,
        p_to_date: filters.toDate || null,
      },
    );

    return rows[0] ?? null;
  } catch (error) {
    if (isMissingRpcError(error)) {
      return null;
    }

    throw error;
  }
}

/**
 * Reads all-time UFC single performance for the selected model.
 */
async function fetchUfcSinglePredictionPerformanceSummary(
  predictionModel: string,
) {
  return fetchUfcSinglePredictionSummary({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  }, predictionModel);
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
  try {
    const rows = await supabaseRpc<PredictionHistoryEntryRow[]>(
      "get_prediction_history_entries",
      {
        p_country: filters.country === "all" ? null : filters.country,
        p_course_slug: filters.course === "all" ? null : filters.course,
        p_from_date: filters.fromDate || null,
        p_limit: DEFAULT_PREDICTION_HISTORY_ROW_LIMIT,
        p_offset: 0,
        p_prediction_model: predictionModel,
        p_race_code: filters.discipline === "all" ? null : filters.discipline,
        p_to_date: filters.toDate || null,
      },
    );

    return {
      history: rows.map(mapPredictionHistoryItem),
      totalCount: rows[0]?.total_count ?? rows.length,
    };
  } catch (error) {
    if (isMissingRpcError(error)) {
      return fetchPredictionHistoryEntriesFallback(filters, predictionModel);
    }

    throw error;
  }
}

/**
 * Reads tracked multi-bet recommendation history with leg-level outcomes.
 */
async function fetchMultiBetRecommendationEntries(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  try {
    const body: Record<string, unknown> = {
      p_country: filters.country === "all" ? null : filters.country,
      p_course_slug: filters.course === "all" ? null : filters.course,
      p_from_date: filters.fromDate || null,
      p_limit: DEFAULT_PREDICTION_HISTORY_ROW_LIMIT,
      p_offset: 0,
      p_prediction_model: predictionModel,
      p_race_code: filters.discipline === "all" ? null : filters.discipline,
      p_recommendation_type: null,
      p_to_date: filters.toDate || null,
    };

    if (maxLegRank !== null) {
      body.p_max_leg_rank = maxLegRank;
    }

    const rows = await supabaseRpc<MultiBetRecommendationHistoryRow[]>(
      "get_multi_bet_recommendation_entries",
      body,
    );

    return {
      history: rows.map(mapMultiBetRecommendationHistoryItem),
      totalCount: rows[0]?.total_count ?? rows.length,
    };
  } catch (error) {
    if (isMissingRpcError(error)) {
      return {
        history: [],
        totalCount: 0,
      };
    }

    throw error;
  }
}

/**
 * Uses signed-in locked racing percentage multi entries when present.
 */
async function fetchUserAwareRacingMultiBetRecommendationEntries(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  const [generatedEntries, lockedEntries] = await Promise.all([
    fetchMultiBetRecommendationEntries(filters, predictionModel, maxLegRank),
    fetchUserLockedMultiBetRecommendationEntries(filters, predictionModel, maxLegRank),
  ]);

  if (lockedEntries.totalCount > 0) {
    return mergeGeneratedAndLockedMultiBetHistory(generatedEntries, lockedEntries);
  }

  return generatedEntries;
}

/**
 * Keeps shared generated history while replacing matching dates with the user's locked multi.
 */
function mergeGeneratedAndLockedMultiBetHistory(
  generatedEntries: { history: MultiBetRecommendationHistoryItem[]; totalCount: number },
  lockedEntries: { history: MultiBetRecommendationHistoryItem[]; totalCount: number },
) {
  const lockedSourceDates = new Set(lockedEntries.history.map((entry) => entry.sourceDate));
  const generatedHistory = generatedEntries.history.filter((entry) => !lockedSourceDates.has(entry.sourceDate));
  const history = [...lockedEntries.history, ...generatedHistory]
    .sort((left, right) => right.sourceDate.localeCompare(left.sourceDate));

  return {
    history,
    totalCount: generatedEntries.totalCount
      - generatedEntries.history.filter((entry) => lockedSourceDates.has(entry.sourceDate)).length
      + lockedEntries.totalCount,
  };
}

/**
 * Reads authenticated user-locked percentage multi history with derived outcomes.
 */
async function fetchUserLockedMultiBetRecommendationEntries(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  try {
    const body: Record<string, unknown> = {
      p_country: filters.country === "all" ? null : filters.country,
      p_course_slug: filters.course === "all" ? null : filters.course,
      p_from_date: filters.fromDate || null,
      p_limit: DEFAULT_PREDICTION_HISTORY_ROW_LIMIT,
      p_offset: 0,
      p_prediction_model: predictionModel,
      p_race_code: filters.discipline === "all" ? null : filters.discipline,
      p_recommendation_type: null,
      p_to_date: filters.toDate || null,
    };

    if (maxLegRank !== null) {
      body.p_max_leg_rank = maxLegRank;
    }

    const rows = await supabaseAuthRpc<MultiBetRecommendationHistoryRow[]>(
      "get_user_locked_multi_recommendation_entries",
      body,
    );

    if (!rows) {
      return {
        history: [],
        totalCount: 0,
      };
    }

    return {
      history: rows.map(mapMultiBetRecommendationHistoryItem),
      totalCount: rows[0]?.total_count ?? rows.length,
    };
  } catch (error) {
    if (isMissingRpcError(error) || isAuthUnavailableError(error)) {
      return {
        history: [],
        totalCount: 0,
      };
    }

    throw error;
  }
}

/**
 * Reads tracked UFC same-card multi history with fight-level outcomes.
 */
async function fetchUfcMultiRecommendationEntries(
  filters: PredictionHistoryFilters,
  predictionModel: string,
  maxLegRank: number | null = null,
) {
  try {
    const body: Record<string, unknown> = {
      p_from_date: filters.fromDate || null,
      p_limit: DEFAULT_PREDICTION_HISTORY_ROW_LIMIT,
      p_offset: 0,
      p_prediction_model: predictionModel,
      p_to_date: filters.toDate || null,
    };

    if (maxLegRank !== null) {
      body.p_max_leg_rank = maxLegRank;
    }

    const rows = await supabaseRpc<UfcMultiRecommendationHistoryRow[]>(
      "get_ufc_multi_recommendation_entries",
      body,
    );

    return {
      history: rows.map(mapUfcMultiRecommendationHistoryItem),
      totalCount: rows[0]?.total_count ?? rows.length,
    };
  } catch (error) {
    if (isMissingRpcError(error)) {
      return {
        history: [],
        totalCount: 0,
      };
    }

    throw error;
  }
}

/**
 * Reads tracked UFC single prediction history with fight-level outcomes.
 */
async function fetchUfcSinglePredictionEntries(
  filters: PredictionHistoryFilters,
  predictionModel: string,
) {
  try {
    const rows = await supabaseRpc<UfcSinglePredictionHistoryRow[]>(
      "get_ufc_single_prediction_entries",
      {
        p_from_date: filters.fromDate || null,
        p_limit: DEFAULT_PREDICTION_HISTORY_ROW_LIMIT,
        p_offset: 0,
        p_prediction_model: predictionModel,
        p_to_date: filters.toDate || null,
      },
    );

    return {
      history: rows.map(mapUfcSinglePredictionHistoryItem),
      totalCount: rows[0]?.total_count ?? rows.length,
    };
  } catch (error) {
    if (isMissingRpcError(error)) {
      return {
        history: [],
        totalCount: 0,
      };
    }

    throw error;
  }
}

/**
 * Keeps Prediction history readable while the ordered-history RPC migration rolls out.
 */
async function fetchPredictionHistoryEntriesFallback(
  filters: PredictionHistoryFilters,
  predictionModel: PredictionModelKey,
) {
  const params: Record<string, string> = {
    limit: String(DEFAULT_PREDICTION_HISTORY_ROW_LIMIT),
    offset: "0",
    order: "outcome_result_position.asc.nullslast,advertised_start.desc.nullslast,predicted_at.desc",
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

function isMissingRpcError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("HTTP 404")
    || error.message.includes("PGRST202")
    || error.message.includes("Could not find the function")
    || error.message.includes("no matches were found in the schema cache")
  );
}

function isMissingTableError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("HTTP 404")
    || error.message.includes("HTTP 400")
  );
}

function isAuthUnavailableError(error: unknown) {
  return error instanceof Error && error.message === "Supabase auth session is unavailable.";
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
    const message = await response.text();
    let detail = message.slice(0, 300);

    try {
      const payload = JSON.parse(message) as { message?: string; details?: string; hint?: string };
      detail = [payload.message, payload.details, payload.hint].filter(Boolean).join(" ");
    } catch {
      // Keep the raw response text when Supabase does not return JSON.
    }

    throw new Error(`Supabase prediction RPC ${name} failed with HTTP ${response.status}: ${detail}`);
  }

  return await response.json() as TResult;
}

/**
 * Calls a PostgREST RPC through the authenticated Supabase client for user-owned rows.
 */
async function supabaseAuthRpc<TResult>(name: string, body: Record<string, unknown>) {
  if (!supabaseClient) {
    throw new Error("Supabase auth session is unavailable.");
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();

  if (!sessionData.session) {
    throw new Error("Supabase auth session is unavailable.");
  }

  const { data, error } = await supabaseClient.rpc(name, body);

  if (error) {
    throw new Error(`Supabase prediction RPC ${name} failed: ${error.message}`);
  }

  return data as TResult;
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
    missingPlaceReturns: 0,
    netReturn: formatCurrency(numeric(row.net_return)),
    placeAverageReturn: formatReturn(0),
    placeHitRate: formatPercentage(0),
    placeNetReturn: formatCurrency(0),
    placeRoi: formatPercentage(0),
    placeSelections: "0 place-eligible selections",
    placeTotalReturned: formatCurrency(0),
    placeTotalStaked: formatCurrency(0),
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

/**
 * Reads signed-in locked multi dates and leg metadata for filter options.
 */
async function fetchUserLockedMultiMetadataRows(
  predictionModel: WinPercentageMultiModelKey,
): Promise<LockedMultiRecommendationMetadataRow[]> {
  if (!supabaseClient) {
    return [];
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();

  if (!sessionData.session) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("user_locked_multi_recommendations")
    .select("source_date,legs")
    .eq("prediction_model", predictionModel)
    .order("source_date", { ascending: false });

  if (error) {
    if (isMissingLockedMultiHistoryTableError(error)) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as LockedMultiRecommendationMetadataRow[];
}

/**
 * Extracts filter metadata from one JSON leg in a locked multi snapshot.
 */
function mapLockedMultiMetadataLeg(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const leg = value as Record<string, unknown>;
  const courseName = stringValue(leg.canonicalTrack)
    ?? stringValue(leg.sourceTrack)
    ?? stringValue(leg.track);

  return {
    country: stringValue(leg.country),
    course_name: courseName,
    course_slug: courseName ? toSlug(courseName) : null,
    race_code: stringValue(leg.code),
  };
}

function isMissingLockedMultiHistoryTableError(error: { code?: string; message?: string }) {
  return error.code === "PGRST205"
    && Boolean(error.message?.includes("user_locked_multi_recommendations"));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

function mapPlacingSummaryStats(row: PredictionSummaryMetrics): FavouriteStat[] {
  return [
    {
      detail: `${row.settled_count} settled · ${row.pending_count} pending`,
      label: "Predictions",
      value: String(row.prediction_count),
    },
    {
      detail: `${row.places ?? 0} places from ${row.place_eligible_count ?? 0} place-eligible settled`,
      label: "Place rate",
      value: formatPercentage(numeric(row.place_percentage ?? 0)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_place_return ?? 0))} cash returned on ${formatCurrency(numeric(row.total_place_stake ?? 0))} place staked`,
      label: "Cash avg",
      value: formatReturn(numeric(row.place_average_return_per_dollar ?? 0)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_place_return ?? 0))} cash returned on ${formatCurrency(numeric(row.total_place_stake ?? 0))} place staked`,
      label: "Cash net",
      value: formatCurrency(numeric(row.place_net_return ?? 0)),
    },
    {
      detail: `${row.wins} wins · ${row.seconds} seconds · ${row.thirds} thirds`,
      label: "Position split",
      value: `${row.wins}/${row.seconds}/${row.thirds}`,
    },
    {
      detail: "AU/NZ: 5-7 starters pays top 2, 8+ pays top 3. HK: 4-6 pays top 2, 7+ pays top 3.",
      label: "Place rule",
      value: String(row.place_eligible_count ?? 0),
    },
    {
      detail: `${row.missing_result_count} missing results · ${row.missing_runner_count} missing runners · ${row.missing_place_return_count ?? 0} missing place dividends`,
      label: "Open issues",
      value: String(row.missing_result_count + row.missing_runner_count + (row.missing_place_return_count ?? 0)),
    },
  ];
}

function mapMultiBetSummaryStats(
  row: MultiBetRecommendationSummaryRow,
  predictionLabel = "Multi-bet predictions",
): FavouriteStat[] {
  if (isPlacingPercentageMultiModel(row.prediction_model)) {
    return [
      {
        detail: `${row.settled_count} settled · ${row.pending_count} pending`,
        label: predictionLabel,
        value: String(row.prediction_count),
      },
      {
        detail: `${row.wins} place multi hits from ${row.settled_count} settled`,
        label: "Place hit rate",
        value: formatPercentage(numeric(row.win_percentage)),
      },
      {
        detail: `${formatCurrency(numeric(row.total_return))} stored return on ${formatCurrency(numeric(row.total_stake))} staked`,
        label: "Cash avg",
        value: formatReturn(numeric(row.average_return_per_dollar)),
      },
      {
        detail: `${formatCurrency(numeric(row.total_return))} stored return on ${formatCurrency(numeric(row.total_stake))} staked`,
        label: "Cash net",
        value: formatCurrency(numeric(row.net_return)),
      },
      {
        detail: `${row.missing_result_count} missing results · ${row.missing_runner_count} missing runners`,
        label: "Open issues",
        value: String(row.missing_result_count + row.missing_runner_count),
      },
    ];
  }

  return [
    {
      detail: `${row.settled_count} settled · ${row.pending_count} pending`,
      label: predictionLabel,
      value: String(row.prediction_count),
    },
    {
      detail: `${row.wins} wins from ${row.settled_count} settled`,
      label: "Win rate",
      value: formatPercentage(numeric(row.win_percentage)),
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
      detail: `${row.missing_result_count} missing results · ${row.missing_runner_count} missing runners`,
      label: "Open issues",
      value: String(row.missing_result_count + row.missing_runner_count),
    },
  ];
}

/**
 * Converts UFC single summary rows into $1 unit-stake performance stats.
 */
function mapUfcSinglePredictionSummaryStats(
  row: MultiBetRecommendationSummaryRow,
  predictionLabel = "UFC single predictions",
): FavouriteStat[] {
  return [
    {
      detail: `${row.settled_count} settled · ${row.pending_count} pending`,
      label: predictionLabel,
      value: String(row.prediction_count),
    },
    {
      detail: `${row.wins} wins from ${row.settled_count} settled`,
      label: "Win rate",
      value: formatPercentage(numeric(row.win_percentage)),
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
      detail: `${row.missing_result_count} missing results`,
      label: "Open issues",
      value: String(row.missing_result_count),
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

/**
 * Converts one UFC single prediction row into the shared single-history display shape.
 */
function mapUfcSinglePredictionHistoryItem(row: UfcSinglePredictionHistoryRow): PredictionHistoryItem {
  const scoreLabel = formatPercentage(numeric(row.win_score));
  const bucketLabel = row.bucket_label ? `${row.bucket_label} bucket` : "No bucket";

  return {
    bonusCredit: "Unavailable",
    cashReturn: formatCurrency(numeric(row.outcome_win_return)),
    country: "UFC",
    discipline: "UFC",
    historyDetail: [
      row.source_card_name ?? "UFC card",
      row.other_fighter_name ? `vs ${row.other_fighter_name}` : null,
      bucketLabel,
    ].filter(Boolean).join(" · "),
    id: row.id,
    outcomeLabel: describeUfcSinglePredictionOutcome(row),
    outcomeTone: getUfcSinglePredictionOutcomeTone(row),
    predictedAtLabel: `Predicted ${formatDateTime(row.predicted_at)}`,
    predictionMeta: [
      row.prediction_rank ? `Rank ${row.prediction_rank}` : "Unranked",
      `Price ${formatPrice(row.predicted_fixed_win_price)}`,
      `${scoreLabel} win score`,
      row.bucket_sample_size ? `${row.bucket_sample_size} samples` : "No sample count",
      `Diff ${formatPriceDifference(row.price_difference)}`,
    ].join(" · "),
    raceLabel: row.fight_name ?? `${row.predicted_fighter_name ?? "Unknown fighter"} vs ${row.other_fighter_name ?? "Unknown opponent"}`,
    runnerLabel: row.predicted_fighter_name ?? "Unknown fighter",
    signalLabel: row.signal_label ?? "UFC win percentage single",
    startLabel: row.advertised_start ? formatDateTime(row.advertised_start) : formatDateLabel(row.source_date),
    totalValue: formatCurrency(numeric(row.outcome_win_return)),
  };
}

/**
 * Converts one tracked multi recommendation into a history row with leg outcomes.
 */
function mapMultiBetRecommendationHistoryItem(
  row: MultiBetRecommendationHistoryRow,
): MultiBetRecommendationHistoryItem {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  const isPlacingPercentageMulti = isPlacingPercentageMultiModel(row.prediction_model);
  const winningLegs = legs.filter((leg) => isSuccessfulMultiBetLeg(leg, row.prediction_model)).length;
  const settledLegs = row.outcome_settled_leg_count || legs.filter((leg) => leg.outcomeStatus === "settled").length;
  const isWinPercentageMulti = isWinPercentageMultiModel(row.prediction_model);

  return {
    averageCashScore: formatMultiBetScore(row.average_cash_score, row.prediction_model),
    averageScoreLabel: isPlacingPercentageMulti ? "Avg place score" : isWinPercentageMulti ? "Avg win score" : "Avg cash",
    combinedFixedPlacePrice: formatCombinedFixedWinPrice(row.combined_fixed_place_price ?? null),
    combinedFixedWinPrice: formatCombinedFixedWinPrice(row.combined_fixed_win_price),
    id: row.id,
    legs: legs.map((leg) => mapMultiBetRecommendationLegItem(leg, row.prediction_model)),
    outcomeLabel: describeMultiBetOutcome(row),
    outcomeTone: getMultiBetOutcomeTone(row),
    predictedAtLabel: `Predicted ${formatDateTime(row.predicted_at)}`,
    recommendationLabel: row.recommendation_type === "positive" ? "Positive multi" : "Neutral multi",
    returnLabel: formatCurrency(numeric(row.outcome_win_return)),
    sourceDate: row.source_date,
    sourceDateLabel: formatDateLabel(row.source_date),
    summaryLabel: `${row.leg_count} legs · ${winningLegs}/${settledLegs || row.leg_count} legs ${isPlacingPercentageMulti ? "placed" : "won"}`,
  };
}

/**
 * Maps one stored multi leg into a scannable win/loss line.
 */
function mapMultiBetRecommendationLegItem(
  leg: MultiBetRecommendationLegRow,
  predictionModel: string | null,
): MultiBetRecommendationLegItem {
  const scoreLabel = formatMultiBetScore(leg.cashAverageScore, predictionModel);
  const isPlacingPercentageMulti = isPlacingPercentageMultiModel(predictionModel);

  return {
    id: `${leg.sourceRaceCardId}-${leg.legIndex ?? 0}`,
    metaLabel: [
      leg.advertisedStart ? formatDateTime(leg.advertisedStart) : null,
      isPercentageMultiModel(predictionModel) && leg.predictionRank
        ? `Rank ${leg.predictionRank}`
        : null,
      leg.country ?? null,
      formatPrice(leg.predictedFixedWinPrice),
      isPlacingPercentageMulti && leg.predictedFixedPlacePrice
        ? `Place ${formatPrice(leg.predictedFixedPlacePrice)}`
        : null,
      isPlacingPercentageMulti
        ? `${scoreLabel} place score`
        : isWinPercentageMultiModel(predictionModel)
          ? `${scoreLabel} win score`
          : `${scoreLabel} cash avg`,
      isPlacingPercentageMulti && leg.placePayoutDepth
        ? `Pays top ${leg.placePayoutDepth}`
        : null,
    ].filter(Boolean).join(" · "),
    outcomeLabel: describeMultiBetLegOutcome(leg, predictionModel),
    outcomeTone: getMultiBetLegOutcomeTone(leg),
    raceCode: leg.raceCode,
    runnerLabel: [
      leg.predictedRunnerNumber ? `#${leg.predictedRunnerNumber}` : null,
      leg.predictedRunnerName ?? "Unknown runner",
    ].filter(Boolean).join(" "),
    scoreLabel,
    title: [
      leg.courseName ?? "Unknown track",
      leg.raceNumber ? `R${leg.raceNumber}` : null,
      leg.raceName ?? null,
    ].filter(Boolean).join(" · "),
  };
}

/**
 * Converts one UFC same-card multi recommendation into the shared history display shape.
 */
function mapUfcMultiRecommendationHistoryItem(
  row: UfcMultiRecommendationHistoryRow,
): MultiBetRecommendationHistoryItem {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  const winningLegs = legs.filter((leg) => isSuccessfulUfcMultiLeg(leg)).length;
  const settledLegs = row.outcome_settled_leg_count || legs.filter((leg) => leg.outcomeStatus === "settled").length;

  return {
    averageCashScore: formatPercentage(numeric(row.average_win_score)),
    averageScoreLabel: "Avg win score",
    combinedFixedPlacePrice: "Unavailable",
    combinedFixedWinPrice: formatCombinedFixedWinPrice(row.combined_fixed_win_price),
    id: row.id,
    legs: legs.map(mapUfcMultiRecommendationLegItem),
    outcomeLabel: describeUfcMultiOutcome(row),
    outcomeTone: getUfcMultiOutcomeTone(row),
    predictedAtLabel: `Predicted ${formatDateTime(row.predicted_at)}`,
    recommendationLabel: `${row.source_card_name ?? "UFC card"} · ${row.recommendation_type === "positive" ? "Positive multi" : "Neutral multi"}`,
    returnLabel: formatCurrency(numeric(row.outcome_win_return)),
    sourceDate: row.source_date,
    sourceDateLabel: formatDateLabel(row.source_date),
    summaryLabel: `${row.leg_count} fights · ${winningLegs}/${settledLegs || row.leg_count} fights won`,
  };
}

/**
 * Maps one UFC multi fight into the existing multi history leg display shape.
 */
function mapUfcMultiRecommendationLegItem(
  leg: UfcMultiRecommendationLegRow,
): MultiBetRecommendationLegItem {
  const scoreLabel = formatPercentage(numeric(leg.winScore));
  const predictedFighter = leg.predictedFighterName ?? "Unknown fighter";
  const otherFighter = leg.otherFighterName ?? "Unknown opponent";

  return {
    id: `${leg.sourceEventId}-${leg.legIndex ?? 0}`,
    metaLabel: [
      leg.advertisedStart ? formatDateTime(leg.advertisedStart) : null,
      leg.predictionRank ? `Rank ${leg.predictionRank}` : null,
      formatPrice(leg.predictedFixedWinPrice),
      `${scoreLabel} win score`,
      leg.bucketLabel ? `${leg.bucketLabel} bucket` : null,
      `Diff ${formatPriceDifference(leg.priceDifference)}`,
    ].filter(Boolean).join(" · "),
    outcomeLabel: describeUfcMultiLegOutcome(leg),
    outcomeTone: getUfcMultiLegOutcomeTone(leg),
    raceCode: "ufc",
    runnerLabel: predictedFighter,
    scoreLabel,
    title: `${predictedFighter} vs ${otherFighter}`,
  };
}

function describeMultiBetOutcome(row: MultiBetRecommendationHistoryRow) {
  if (row.outcome_status === "settled") {
    if (isPlacingPercentageMultiModel(row.prediction_model)) {
      return numeric(row.outcome_win_return) > 0 ? "Placed" : "Missed";
    }

    return numeric(row.outcome_win_return) > 0
      ? `Won · ${formatCurrency(numeric(row.outcome_win_return))} cash`
      : "Lost";
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

function getMultiBetOutcomeTone(row: MultiBetRecommendationHistoryRow): MultiBetRecommendationHistoryItem["outcomeTone"] {
  if (row.outcome_status === "settled" && numeric(row.outcome_win_return) > 0) {
    return "good";
  }

  return row.outcome_status === "pending" ? "warning" : "default";
}

function describeMultiBetLegOutcome(leg: MultiBetRecommendationLegRow, predictionModel: string | null) {
  if (leg.outcomeStatus === "settled") {
    if (isPlacingPercentageMultiModel(predictionModel)) {
      if (isSuccessfulMultiBetLeg(leg, predictionModel)) {
        return `Placed${leg.outcomeResultPosition ? ` · ${ordinal(leg.outcomeResultPosition)}` : ""}`;
      }

      return `Missed${leg.outcomeResultPosition ? ` · ${ordinal(leg.outcomeResultPosition)}` : ""}`;
    }

    if (isSuccessfulMultiBetLeg(leg, predictionModel)) {
      return "Won";
    }

    return leg.outcomeResultPosition === 1
      ? "Won"
      : `Lost${leg.outcomeResultPosition ? ` · ${ordinal(leg.outcomeResultPosition)}` : ""}`;
  }

  if (leg.outcomeStatus === "pending") {
    return "Pending";
  }

  if (leg.outcomeStatus === "missing_runner") {
    return "Missing runner";
  }

  if (leg.outcomeStatus === "race_not_found") {
    return "Race not found";
  }

  return "Missing result";
}

function getMultiBetLegOutcomeTone(leg: MultiBetRecommendationLegRow): MultiBetRecommendationLegItem["outcomeTone"] {
  if (leg.outcomeStatus === "settled" && Number(leg.outcomeWinReturn ?? 0) > 0) {
    return "good";
  }

  return leg.outcomeStatus === "pending" ? "warning" : "default";
}

function describeUfcMultiOutcome(row: UfcMultiRecommendationHistoryRow) {
  if (row.outcome_status === "settled") {
    return numeric(row.outcome_win_return) > 0
      ? `Won · ${formatCurrency(numeric(row.outcome_win_return))} cash`
      : "Lost";
  }

  if (row.outcome_status === "pending") {
    return "Pending result";
  }

  return "Missing result";
}

function getUfcMultiOutcomeTone(row: UfcMultiRecommendationHistoryRow): MultiBetRecommendationHistoryItem["outcomeTone"] {
  if (row.outcome_status === "settled" && numeric(row.outcome_win_return) > 0) {
    return "good";
  }

  return row.outcome_status === "pending" ? "warning" : "default";
}

function describeUfcMultiLegOutcome(leg: UfcMultiRecommendationLegRow) {
  if (leg.outcomeStatus === "settled") {
    return isSuccessfulUfcMultiLeg(leg) ? "Won" : "Lost";
  }

  return leg.outcomeStatus === "pending" ? "Pending" : "Missing result";
}

function getUfcMultiLegOutcomeTone(leg: UfcMultiRecommendationLegRow): MultiBetRecommendationLegItem["outcomeTone"] {
  if (leg.outcomeStatus === "settled" && Number(leg.outcomeWinReturn ?? 0) > 0) {
    return "good";
  }

  return leg.outcomeStatus === "pending" ? "warning" : "default";
}

function describeUfcSinglePredictionOutcome(row: UfcSinglePredictionHistoryRow) {
  if (row.outcome_status === "settled") {
    return numeric(row.outcome_win_return) > 0
      ? `Won · ${formatCurrency(numeric(row.outcome_win_return))} cash`
      : "Lost";
  }

  return row.outcome_status === "pending" ? "Pending result" : "Missing result";
}

function getUfcSinglePredictionOutcomeTone(row: UfcSinglePredictionHistoryRow): PredictionHistoryItem["outcomeTone"] {
  if (row.outcome_status === "settled" && numeric(row.outcome_win_return) > 0) {
    return "good";
  }

  return row.outcome_status === "pending" ? "warning" : "default";
}

function describeOutcome(row: PredictionHistoryRow) {
  if (row.outcome_status === "settled") {
    const cashReturn = numeric(row.outcome_win_return);
    const bonusCredit = numeric(row.outcome_bonus_credit);

    if (row.outcome_result_position === 1) {
      return `1st · ${formatCurrency(cashReturn)} cash`;
    }

    if (bonusCredit > 0) {
      return row.outcome_result_position
        ? `${ordinal(row.outcome_result_position)} · ${formatCurrency(bonusCredit)} bonus bet`
        : `Settled · ${formatCurrency(bonusCredit)} bonus bet`;
    }

    return row.outcome_result_position
      ? `${ordinal(row.outcome_result_position)} · no return`
      : "Settled · no return";
  }

  if (row.outcome_status === "pending") {
    return "Pending result";
  }

  if (row.outcome_status === "missing_runner") {
    if ((row.outcome_starter_count ?? 0) === 0) {
      return "Missing race-card data";
    }

    return "Missing runner match";
  }

  if (row.outcome_status === "race_not_found") {
    return "Race not found";
  }

  return "Missing result";
}

function getOutcomeTone(row: PredictionHistoryRow): PredictionHistoryItem["outcomeTone"] {
  if (row.outcome_status === "settled") {
    if (numeric(row.outcome_win_return) > 0) {
      return "good";
    }

    return numeric(row.outcome_bonus_credit) > 0 ? "bonus" : "default";
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

/**
 * Returns yesterday as a source-date string using the app's racing timezone.
 */
function getYesterdaySourceDate() {
  return offsetSourceDate(-1);
}

/**
 * Returns today's source-date string using the app's racing timezone.
 */
function getTodaySourceDate() {
  return offsetSourceDate(0);
}

/**
 * Calculates source dates from the racing timezone calendar day, not UTC.
 */
function offsetSourceDate(offsetDays: number) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  }

  const sourceTodayUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));

  return new Date(sourceTodayUtc + offsetDays * 86400000).toISOString().slice(0, 10);
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
    timeZone: SOURCE_TIME_ZONE,
  }).format(date);
}

function formatPrice(value: NullableNumber) {
  const number = numeric(value);

  return number ? `$${number.toFixed(2)}` : "Unavailable";
}

function formatCombinedFixedWinPrice(value: NullableNumber) {
  const number = numeric(value);

  return number ? `$${number.toFixed(2)}` : "Unavailable";
}

function formatMultiBetScore(value: NullableNumber, predictionModel: string | null) {
  const number = numeric(value);

  return isPercentageMultiModel(predictionModel)
    ? formatPercentage(number)
    : formatCurrency(number);
}

function isWinPercentageMultiModel(predictionModel: string | null) {
  return predictionModel === WIN_PERCENTAGE_MULTI_MODEL_KEY
    || predictionModel === WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY
    || predictionModel === WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY;
}

function isPlacingPercentageMultiModel(predictionModel: string | null) {
  return predictionModel === PLACING_PERCENTAGE_MULTI_MODEL_KEY;
}

function isPercentageMultiModel(predictionModel: string | null) {
  return isWinPercentageMultiModel(predictionModel)
    || isPlacingPercentageMultiModel(predictionModel);
}

function isSuccessfulMultiBetLeg(leg: MultiBetRecommendationLegRow, predictionModel: string | null) {
  if (leg.outcomeStatus !== "settled") {
    return false;
  }

  if (isPlacingPercentageMultiModel(predictionModel)) {
    return Number(leg.outcomeWinReturn ?? 0) > 0
      || Boolean(leg.placePayoutDepth && leg.outcomeResultPosition && leg.outcomeResultPosition <= leg.placePayoutDepth);
  }

  return leg.outcomeResultPosition === 1;
}

function isSuccessfulUfcMultiLeg(leg: UfcMultiRecommendationLegRow) {
  return leg.outcomeStatus === "settled" && Number(leg.outcomeWinReturn ?? 0) > 0;
}

function getWinPercentageMultiPredictionLabel(predictionModel: WinPercentageMultiModelKey) {
  if (predictionModel === PLACING_PERCENTAGE_MULTI_MODEL_KEY) {
    return "Place percentage multis";
  }

  if (predictionModel === UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY) {
    return "UFC favourite price multis";
  }

  if (predictionModel === UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY) {
    return "UFC other fighter price multis";
  }

  if (predictionModel === UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY) {
    return "UFC price difference multis";
  }

  if (predictionModel === WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY) {
    return "60%+ win multis";
  }

  if (predictionModel === WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY) {
    return "65%+ win multis";
  }

  return "Win percentage multis";
}

function getUfcWinPercentageSinglePredictionLabel(predictionModel: WinPercentageMultiModelKey) {
  if (predictionModel === UFC_SINGLE_65_PLUS_MODEL_KEY) {
    return "UFC 65%+ win singles";
  }

  if (predictionModel === UFC_SINGLE_75_PLUS_MODEL_KEY) {
    return "UFC 75%+ win singles";
  }

  if (predictionModel === UFC_SINGLE_85_PLUS_MODEL_KEY) {
    return "UFC 85%+ win singles";
  }

  if (predictionModel === UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY) {
    return "UFC other fighter price singles";
  }

  if (predictionModel === UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY) {
    return "UFC price difference singles";
  }

  return "UFC favourite price singles";
}

export function isUfcPercentageMultiModel(predictionModel: string | null) {
  return predictionModel === UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY
    || predictionModel === UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY
    || predictionModel === UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY
    || predictionModel === UFC_SINGLE_65_PLUS_MODEL_KEY
    || predictionModel === UFC_SINGLE_75_PLUS_MODEL_KEY
    || predictionModel === UFC_SINGLE_85_PLUS_MODEL_KEY;
}

function formatPriceDifference(value: NullableNumber) {
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
