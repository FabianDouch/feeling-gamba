import { publicEnv } from "../config/env";
import type { FavouriteStat } from "./collectedRaceDay";

const SUPABASE_PAGE_SIZE = 1000;

type NullableNumber = number | string | null;
export type TennisPriceBucketSize = "0.25" | "0.50";

export type TennisInsightBreakdown = {
  averageReturn: string;
  detail: string;
  label: string;
  netReturn: string;
  pending: string;
  roi: string;
  selections: string;
  totalReturned: string;
  totalStaked: string;
  winRate: string;
};

export type TennisPriceBreakdownGroups = Record<TennisPriceBucketSize, TennisInsightBreakdown[]>;

export type TennisInsightsData = {
  fixedWinCompetitionBreakdown: TennisInsightBreakdown[];
  fixedWinOtherPlayerPriceBreakdown: TennisPriceBreakdownGroups;
  fixedWinOtherPlayerPriceBreakdownPlus: TennisPriceBreakdownGroups;
  fixedWinPriceBreakdown: TennisPriceBreakdownGroups;
  fixedWinPriceBreakdownPlus: TennisPriceBreakdownGroups;
  fixedWinPriceDifferenceBreakdown: TennisPriceBreakdownGroups;
  fixedWinPriceDifferenceBreakdownPlus: TennisPriceBreakdownGroups;
  fixedWinSummaryStats: FavouriteStat[];
  fixedWinTourBreakdown: TennisInsightBreakdown[];
};

type TennisInsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  bucket_size: NullableNumber;
  competition_key: string | null;
  competition_name: string | null;
  event_count: number;
  insight_type: "fixed_win_single";
  missing_price_count: number;
  missing_result_count: number;
  net_return: NullableNumber;
  pending_count: number;
  price_bucket_end: NullableNumber;
  price_bucket_label: string | null;
  price_bucket_start: NullableNumber;
  roi_percentage: NullableNumber;
  scope_key: string;
  scope_type: TennisInsightScopeType;
  selection_count: number;
  selection_type: "favourite" | null;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  tour: string | null;
  unmatched_count: number;
  win_count: number;
  win_percentage: NullableNumber;
};

type TennisInsightScopeType =
  | "overall"
  | "tour"
  | "competition"
  | "price_bucket"
  | "price_bucket_plus"
  | "other_player_price_bucket"
  | "other_player_price_bucket_plus"
  | "price_difference_bucket"
  | "price_difference_bucket_plus";

const TENNIS_INSIGHT_SELECT = [
  "average_return_per_dollar",
  "bucket_size",
  "competition_key",
  "competition_name",
  "event_count",
  "insight_type",
  "missing_price_count",
  "missing_result_count",
  "net_return",
  "pending_count",
  "price_bucket_end",
  "price_bucket_label",
  "price_bucket_start",
  "roi_percentage",
  "scope_key",
  "scope_type",
  "selection_count",
  "selection_type",
  "total_return",
  "total_stake",
  "tour",
  "unmatched_count",
  "win_count",
  "win_percentage",
].join(",");

export const hasSupabaseTennisConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads the stored Tennis aggregate rows shown in the Tennis Insights view.
 */
export async function fetchTennisInsights(): Promise<TennisInsightsData> {
  const [
    overallRows,
    tourRows,
    competitionRows,
    priceRows,
    pricePlusRows,
    otherPlayerPriceRows,
    otherPlayerPricePlusRows,
    priceDifferenceRows,
    priceDifferencePlusRows,
  ] = await Promise.all([
    fetchTennisAggregateRows("overall", {
      scope_key: "eq.tennis:fixed_win_single:overall:favourite",
    }),
    fetchTennisAggregateRows("tour", {
      order: "tour.asc",
    }),
    fetchTennisAggregateRows("competition", {
      order: "win_percentage.desc,selection_count.desc,competition_name.asc",
    }),
    fetchTennisAggregateRows("price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchTennisAggregateRows("price_bucket_plus", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchTennisAggregateRows("other_player_price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchTennisAggregateRows("other_player_price_bucket_plus", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchTennisAggregateRows("price_difference_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchTennisAggregateRows("price_difference_bucket_plus", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
  ]);
  const overall = overallRows[0] ?? null;

  return {
    fixedWinCompetitionBreakdown: competitionRows.map(mapTennisBreakdown),
    fixedWinOtherPlayerPriceBreakdown: mapPriceBreakdownGroups(otherPlayerPriceRows),
    fixedWinOtherPlayerPriceBreakdownPlus: mapPriceBreakdownGroups(otherPlayerPricePlusRows),
    fixedWinPriceBreakdown: mapPriceBreakdownGroups(priceRows),
    fixedWinPriceBreakdownPlus: mapPriceBreakdownGroups(pricePlusRows),
    fixedWinPriceDifferenceBreakdown: mapPriceBreakdownGroups(priceDifferenceRows),
    fixedWinPriceDifferenceBreakdownPlus: mapPriceBreakdownGroups(priceDifferencePlusRows),
    fixedWinSummaryStats: overall ? mapTennisSummaryStats(overall) : [],
    fixedWinTourBreakdown: tourRows.map(mapTennisBreakdown),
  };
}

/**
 * Reads one Tennis aggregate scope from Supabase.
 */
function fetchTennisAggregateRows(
  scopeType: TennisInsightScopeType,
  extraParams: Record<string, string> = {},
) {
  return supabaseSelectAll<TennisInsightAggregateRow>("tennis_insight_aggregates", {
    insight_type: "eq.fixed_win_single",
    scope_type: `eq.${scopeType}`,
    select: TENNIS_INSIGHT_SELECT,
    ...extraParams,
  });
}

/**
 * Maps the overall Tennis favourite row to KPI cards.
 */
function mapTennisSummaryStats(row: TennisInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled favourite selections`,
      label: "Fixed-win favourite rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 favourite return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.pending_count} pending, ${row.unmatched_count} unmatched, ${row.missing_result_count} missing result`,
      label: "Snapshot audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Groups Tennis price buckets by selected granularity.
 */
function mapPriceBreakdownGroups(rows: TennisInsightAggregateRow[]): TennisPriceBreakdownGroups {
  const groups: TennisPriceBreakdownGroups = {
    "0.25": [],
    "0.50": [],
  };

  for (const row of rows) {
    groups[getBucketSizeKey(row.bucket_size)].push(mapTennisBreakdown(row));
  }

  return groups;
}

/**
 * Maps a Tennis aggregate row to the shared breakdown display model.
 */
function mapTennisBreakdown(row: TennisInsightAggregateRow): TennisInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled selections`,
    label: getTennisAggregateLabel(row),
    netReturn: formatCurrency(numeric(row.net_return)),
    pending: `${row.pending_count} pending`,
    roi: formatPercentage(numeric(row.roi_percentage)),
    selections: `${row.selection_count} selections`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Builds the most useful display label from a Tennis aggregate row.
 */
function getTennisAggregateLabel(row: TennisInsightAggregateRow) {
  if (isTennisPriceBucketScope(row.scope_type) && row.price_bucket_label) {
    return row.price_bucket_label;
  }

  if (row.scope_type === "tour" && row.tour) {
    return row.tour.toUpperCase();
  }

  if (row.scope_type === "competition" && row.competition_name) {
    return row.competition_name;
  }

  return row.scope_key;
}

/**
 * Identifies Tennis aggregate scopes that use shared price bucket fields.
 */
function isTennisPriceBucketScope(scopeType: TennisInsightScopeType) {
  return scopeType === "price_bucket"
    || scopeType === "price_bucket_plus"
    || scopeType === "other_player_price_bucket"
    || scopeType === "other_player_price_bucket_plus"
    || scopeType === "price_difference_bucket"
    || scopeType === "price_difference_bucket_plus";
}

/**
 * Normalizes stored numeric bucket sizes to stable app keys.
 */
function getBucketSizeKey(value: NullableNumber): TennisPriceBucketSize {
  return Number(value) === 0.25 ? "0.25" : "0.50";
}

/**
 * Reads all matching Supabase REST rows across paginated responses.
 */
async function supabaseSelectAll<TRow>(table: string, params: Record<string, string | number>) {
  const rows: TRow[] = [];
  let offset = 0;

  while (true) {
    const page = await supabaseSelectPage<TRow>(table, {
      ...params,
      limit: SUPABASE_PAGE_SIZE,
      offset,
    });
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    offset += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

/**
 * Reads one Supabase REST page for an app-facing table.
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
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} read failed with HTTP ${response.status}`);
  }

  return await response.json() as TRow[];
}

function numeric(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
