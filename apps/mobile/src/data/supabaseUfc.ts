import { publicEnv } from "../config/env";
import type { FavouriteStat, PriceBreakdown, RaceFilterOption } from "./collectedRaceDay";

const SUPABASE_PAGE_SIZE = 1000;
const DEFAULT_DATE_WINDOW_SIZE = 14;
export const DEFAULT_UFC_ROW_LIMIT = 20;

type NullableNumber = number | string | null;
type CombatSport = "pfl" | "ufc";

const COMBAT_SPORT_CONFIG = {
  pfl: {
    dateLabel: "PFL",
    defaultEmptyDateLabel: "No PFL dates",
    fightLabel: "PFL",
    fightTable: "pfl_fight_entries",
    insightTable: "pfl_insight_aggregates",
    leftFighterColumn: "fighter_one_name",
    metadataEmptyLabel: "No PFL dates loaded from Supabase.",
    overallScopeKey: "pfl:overall",
    rightFighterColumn: "fighter_two_name",
  },
  ufc: {
    dateLabel: "UFC",
    defaultEmptyDateLabel: "No UFC dates",
    fightLabel: "UFC",
    fightTable: "ufc_fight_entries",
    insightTable: "ufc_insight_aggregates",
    leftFighterColumn: "red_fighter_name",
    metadataEmptyLabel: "No UFC dates loaded from Supabase.",
    overallScopeKey: "ufc:overall",
    rightFighterColumn: "blue_fighter_name",
  },
} as const;

export type UfcHistoricalFilters = {
  fromDate: string;
  toDate: string;
};

export type UfcHistoricalMetadata = {
  dateOptions: RaceFilterOption[];
  defaultDateRange: {
    from: string;
    to: string;
  };
  latestWindowLabel: string;
  latestWindowRangeLabel: string;
};

export type UfcFightSummary = {
  eventDate: string;
  eventDateLabel: string;
  favourite: string;
  favouritePrice: string;
  fightId: string;
  fighters: string;
  otherFighterPrice: string;
  payout: string;
  priceDifference: string;
  priceSource: string;
  result: string;
  status: string;
  winner: string;
};

export type UfcHistoricalQueryResult = {
  fights: UfcFightSummary[];
  totalCount: number;
};

export type UfcInsightsData = {
  favouritePriceBreakdown: PriceBreakdown[];
  otherFighterPriceBreakdown: PriceBreakdown[];
  priceDifferenceBreakdown: PriceBreakdown[];
  summaryStats: FavouriteStat[];
};

type UfcFightEntryRow = {
  event_date: string;
  favourite_name: string | null;
  favourite_price: NullableNumber;
  favourite_win_return: NullableNumber;
  id: string;
  left_fighter_name: string;
  other_fighter_price: NullableNumber;
  price_difference: NullableNumber;
  price_match_status: string;
  price_source: string;
  right_fighter_name: string;
  result_status: string;
  winner_name: string | null;
};

type UfcInsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  favourite_selections: number;
  favourite_win_percentage: NullableNumber;
  favourite_wins: number;
  fight_count: number;
  missing_price_count: number;
  net_return: NullableNumber;
  price_bucket_label: string | null;
  priced_fight_count: number;
  result_only_count: number;
  review_candidate_count: number;
  roi_percentage: NullableNumber;
  scope_key: string;
  scope_type: UfcInsightScopeType;
  total_return: NullableNumber;
  total_stake: NullableNumber;
};

type UfcInsightScopeType =
  | "overall"
  | "favourite_price_bucket"
  | "other_fighter_price_bucket"
  | "price_difference_bucket"
  | "price_match_status";

export const hasSupabaseUfcConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);
export const hasSupabasePflConfig = hasSupabaseUfcConfig;

/**
 * Reads UFC Historical Data metadata used to build the date filters.
 */
export async function fetchUfcHistoricalMetadata(): Promise<UfcHistoricalMetadata> {
  return fetchCombatHistoricalMetadata("ufc");
}

/**
 * Reads PFL Historical Data metadata used to build the date filters.
 */
export async function fetchPflHistoricalMetadata(): Promise<UfcHistoricalMetadata> {
  return fetchCombatHistoricalMetadata("pfl");
}

async function fetchCombatHistoricalMetadata(sport: CombatSport): Promise<UfcHistoricalMetadata> {
  const config = COMBAT_SPORT_CONFIG[sport];
  const dateRows = await supabaseSelectAll<{ event_date: string }>(config.fightTable, {
    order: "event_date.desc",
    select: "event_date",
  });
  const dates = unique(dateRows.map((row) => row.event_date)).sort();
  const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);
  const from = latestDates[0] ?? dates[0] ?? "";
  const to = latestDates.at(-1) ?? from;

  return {
    dateOptions: dates.map((date) => ({
      label: formatLongDateLabel(date),
      value: date,
    })),
    defaultDateRange: {
      from,
      to,
    },
    latestWindowLabel: dates.length
      ? `${formatLongDateLabel(dates[0])} - ${formatLongDateLabel(dates.at(-1) ?? dates[0])}`
      : config.defaultEmptyDateLabel,
    latestWindowRangeLabel: from
      ? `Default shows latest ${DEFAULT_UFC_ROW_LIMIT} fights. Date reset covers latest ${latestDates.length} ${config.dateLabel} event dates: ${formatLongDateLabel(from)} - ${formatLongDateLabel(to)}`
      : config.metadataEmptyLabel,
  };
}

/**
 * Fetches UFC historical fight rows from Supabase for the selected date range.
 */
export async function fetchUfcHistoricalEntries(
  filters: UfcHistoricalFilters,
  options: { limit?: number } = {},
): Promise<UfcHistoricalQueryResult> {
  return fetchCombatHistoricalEntries("ufc", filters, options);
}

/**
 * Fetches PFL historical fight rows from Supabase for the selected date range.
 */
export async function fetchPflHistoricalEntries(
  filters: UfcHistoricalFilters,
  options: { limit?: number } = {},
): Promise<UfcHistoricalQueryResult> {
  return fetchCombatHistoricalEntries("pfl", filters, options);
}

async function fetchCombatHistoricalEntries(
  sport: CombatSport,
  filters: UfcHistoricalFilters,
  options: { limit?: number } = {},
): Promise<UfcHistoricalQueryResult> {
  const config = COMBAT_SPORT_CONFIG[sport];
  const params: Record<string, string> = {
    order: `event_date.desc,${config.leftFighterColumn}.asc`,
    select: [
      "id",
      "event_date",
      `left_fighter_name:${config.leftFighterColumn}`,
      `right_fighter_name:${config.rightFighterColumn}`,
      "winner_name",
      "result_status",
      "price_match_status",
      "price_source",
      "favourite_name",
      "favourite_price",
      "other_fighter_price",
      "price_difference",
      "favourite_win_return",
    ].join(","),
  };

  if (filters.fromDate && filters.toDate) {
    params.and = `(event_date.gte.${filters.fromDate},event_date.lte.${filters.toDate})`;
  }

  const { count, rows } = options.limit
    ? await supabaseSelectLimitedWithCount<UfcFightEntryRow>(config.fightTable, params, options.limit)
    : await supabaseSelectAllWithCount<UfcFightEntryRow>(config.fightTable, params);

  return {
    fights: rows.map((row) => mapCombatFightEntryToSummary(row, sport)),
    totalCount: count ?? rows.length,
  };
}

/**
 * Creates the initial UFC Historical Data date filters from Supabase metadata.
 */
export function createDefaultUfcHistoricalFilters(metadata: UfcHistoricalMetadata): UfcHistoricalFilters {
  return {
    fromDate: metadata.defaultDateRange.from,
    toDate: metadata.defaultDateRange.to,
  };
}

/**
 * Reads the stored UFC aggregate rows shown in the UFC Insights view.
 */
export async function fetchUfcInsights(): Promise<UfcInsightsData> {
  return fetchCombatInsights("ufc");
}

/**
 * Reads the stored PFL aggregate rows shown in the PFL Insights view.
 */
export async function fetchPflInsights(): Promise<UfcInsightsData> {
  return fetchCombatInsights("pfl");
}

async function fetchCombatInsights(sport: CombatSport): Promise<UfcInsightsData> {
  const config = COMBAT_SPORT_CONFIG[sport];
  const [overallRows, favouritePriceRows, otherFighterPriceRows, priceDifferenceRows] = await Promise.all([
    supabaseSelectAll<UfcInsightAggregateRow>(config.insightTable, {
      scope_key: `eq.${config.overallScopeKey}`,
      select: UFC_INSIGHT_SELECT,
    }),
    fetchCombatBucketRows(sport, "favourite_price_bucket"),
    fetchCombatBucketRows(sport, "other_fighter_price_bucket"),
    fetchCombatBucketRows(sport, "price_difference_bucket"),
  ]);
  const overall = overallRows[0] ?? null;

  return {
    favouritePriceBreakdown: favouritePriceRows.map(mapUfcPriceBreakdown),
    otherFighterPriceBreakdown: otherFighterPriceRows.map(mapUfcPriceBreakdown),
    priceDifferenceBreakdown: priceDifferenceRows.map(mapUfcPriceBreakdown),
    summaryStats: overall ? mapUfcSummaryStats(overall) : [],
  };
}

const UFC_INSIGHT_SELECT = [
  "average_return_per_dollar",
  "favourite_selections",
  "favourite_win_percentage",
  "favourite_wins",
  "fight_count",
  "missing_price_count",
  "net_return",
  "price_bucket_label",
  "priced_fight_count",
  "result_only_count",
  "review_candidate_count",
  "roi_percentage",
  "scope_key",
  "scope_type",
  "total_return",
  "total_stake",
].join(",");

function fetchCombatBucketRows(
  sport: CombatSport,
  scopeType: Exclude<UfcInsightScopeType, "overall" | "price_match_status">,
) {
  return supabaseSelectAll<UfcInsightAggregateRow>(COMBAT_SPORT_CONFIG[sport].insightTable, {
    order: "price_bucket_start.asc",
    scope_type: `eq.${scopeType}`,
    select: UFC_INSIGHT_SELECT,
  });
}

/**
 * Maps one fight entry to the compact Historical Data row shape.
 */
function mapCombatFightEntryToSummary(row: UfcFightEntryRow, sport: CombatSport): UfcFightSummary {
  const favouritePrice = numericOrNull(row.favourite_price);
  const favouriteReturn = numericOrNull(row.favourite_win_return);

  return {
    eventDate: row.event_date,
    eventDateLabel: formatDateLabel(row.event_date),
    favourite: row.favourite_name ?? "No clear favourite",
    favouritePrice: favouritePrice === null ? "Missing" : formatReturn(favouritePrice),
    fightId: row.id,
    fighters: `${row.left_fighter_name} vs ${row.right_fighter_name}`,
    otherFighterPrice: formatNullableReturn(row.other_fighter_price),
    payout: favouriteReturn === null ? "Excluded from return stats" : `Fav return ${formatReturn(favouriteReturn)}`,
    priceDifference: formatNullableReturn(row.price_difference),
    priceSource: formatPriceSource(row.price_match_status, row.price_source, sport),
    result: describeFavouriteResult(row.favourite_name, row.winner_name),
    status: row.result_status === "settled" ? "Final" : "Non-standard",
    winner: row.winner_name ?? "No settled winner",
  };
}

function mapUfcSummaryStats(row: UfcInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.favourite_wins} of ${row.favourite_selections} priced favourite selections`,
      label: "Favourite win rate",
      value: formatPercentage(numeric(row.favourite_win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 favourite return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.priced_fight_count} priced, ${row.result_only_count} result-only, ${row.missing_price_count} missing price`,
      label: "Historical fights",
      value: String(row.fight_count),
    },
  ];
}

function mapUfcPriceBreakdown(row: UfcInsightAggregateRow): PriceBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    label: row.price_bucket_label ?? row.scope_key,
    missingPlaceReturns: 0,
    netReturn: formatCurrency(numeric(row.net_return)),
    placeAverageReturn: "$0.00",
    placeHitRate: "0.00%",
    placeNetReturn: "$0.00",
    placeRoi: "0.00%",
    placeSelections: "0 place selections",
    placeTotalReturned: "$0.00",
    placeTotalStaked: "$0.00",
    selections: `${row.favourite_selections} favourite selections`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.favourite_win_percentage)),
  };
}

/**
 * Reads a capped Supabase result while still asking PostgREST for the matching row count.
 */
async function supabaseSelectLimitedWithCount<TRow>(
  table: string,
  params: Record<string, string | number>,
  limit: number,
) {
  return supabaseSelectPage<TRow>(table, {
    ...params,
    limit,
    offset: 0,
  });
}

/**
 * Reads all matching Supabase REST rows across paginated responses.
 */
async function supabaseSelectAll<TRow>(table: string, params: Record<string, string | number>) {
  const { rows } = await supabaseSelectAllWithCount<TRow>(table, params);
  return rows;
}

/**
 * Reads all matching Supabase REST rows and returns the exact count header when available.
 */
async function supabaseSelectAllWithCount<TRow>(
  table: string,
  params: Record<string, string | number>,
) {
  const rows: TRow[] = [];
  let count: number | null = null;
  let offset = 0;

  do {
    const page = await supabaseSelectPage<TRow>(table, {
      ...params,
      limit: SUPABASE_PAGE_SIZE,
      offset,
    });
    rows.push(...page.rows);
    count = page.count ?? count;

    if (page.rows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    offset += SUPABASE_PAGE_SIZE;
  } while (count === null || rows.length < count);

  return {
    count,
    rows,
  };
}

/**
 * Reads one Supabase REST page with count metadata.
 */
async function supabaseSelectPage<TRow>(table: string, params: Record<string, string | number>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
      prefer: "count=exact",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} read failed with HTTP ${response.status}`);
  }

  return {
    count: parseContentRangeCount(response.headers.get("content-range")),
    rows: await response.json() as TRow[],
  };
}

function parseContentRangeCount(value: string | null) {
  const match = value?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function unique<TValue>(values: TValue[]) {
  return Array.from(new Set(values));
}

function numeric(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericOrNull(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNullableReturn(value: NullableNumber) {
  const parsed = numericOrNull(value);
  return parsed === null ? "Missing" : formatReturn(parsed);
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatPriceSource(matchStatus: string, source: string, sport: CombatSport) {
  if (sport === "pfl" && matchStatus === "bookmakers_review_priced") {
    return "Priced odds";
  }

  if (sport === "pfl" && matchStatus === "current_snapshot") {
    return "Current snapshot";
  }

  if (matchStatus === "master_priced") {
    return "Master odds";
  }

  if (matchStatus === "daily_exact") {
    return "Daily odds exact";
  }

  if (matchStatus === "review_candidate") {
    return "Needs review";
  }

  return source === "missing" ? "Result only" : source;
}

function describeFavouriteResult(favouriteName: string | null, winnerName: string | null) {
  if (!favouriteName) {
    return "No favourite result";
  }

  if (!winnerName) {
    return "Winner missing";
  }

  return favouriteName === winnerName ? "Favourite won" : "Favourite lost";
}

/**
 * Turns an ISO date string into the compact date label used in historical rows.
 */
function formatDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

/**
 * Turns an ISO date string into the full date label used by filters and range text.
 */
function formatLongDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}
