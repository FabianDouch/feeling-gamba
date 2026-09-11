import { publicEnv } from "../config/env";
import type { FavouriteStat } from "./collectedRaceDay";

const SUPABASE_PAGE_SIZE = 1000;

type NullableNumber = number | string | null;
export type BundesligaPriceBucketSize = "0.25" | "0.50";

export type BundesligaInsightBreakdown = {
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

export type BundesligaFixedWinPriceRole = "favourite" | "home" | "away";

export type BundesligaFixedWinPriceBreakdowns = Record<BundesligaFixedWinPriceRole, BundesligaInsightBreakdown[]>;
export type BundesligaFixedWinPriceBreakdownGroups = Record<BundesligaPriceBucketSize, BundesligaFixedWinPriceBreakdowns>;
export type BundesligaPriceBreakdownGroups = Record<BundesligaPriceBucketSize, BundesligaInsightBreakdown[]>;

export type BundesligaInsightsData = {
  fixedDrawPriceBreakdown: BundesligaPriceBreakdownGroups;
  fixedDrawPriceBreakdownPlus: BundesligaPriceBreakdownGroups;
  fixedDrawSummaryStats: FavouriteStat[];
  fixedWinOtherTeamPriceBreakdown: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinOtherTeamPriceBreakdownPlus: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinPriceDifferenceBreakdown: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinPriceDifferenceBreakdownPlus: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinPriceBreakdown: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinPriceBreakdownPlus: BundesligaFixedWinPriceBreakdownGroups;
  fixedWinRoundBreakdown: BundesligaInsightBreakdown[];
  fixedWinSelectionBreakdown: BundesligaInsightBreakdown[];
  fixedWinSummaryStats: FavouriteStat[];
  halfTimeFullTimeSelectionBreakdown: BundesligaInsightBreakdown[];
  halfTimeFullTimeSummaryStats: FavouriteStat[];
  sameGameRoundBreakdown: BundesligaInsightBreakdown[];
  sameGameSummaryStats: FavouriteStat[];
  tryScorerPlayerBreakdown: BundesligaInsightBreakdown[];
  tryScorerPriceBreakdown: BundesligaPriceBreakdownGroups;
  tryScorerSummaryStats: FavouriteStat[];
  tryScorerTeamBreakdown: BundesligaInsightBreakdown[];
};

type BundesligaInsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  event_count: number;
  insight_type: BundesligaInsightType;
  missing_price_count: number;
  missing_result_count: number;
  net_return: NullableNumber;
  pending_count: number;
  player_name: string | null;
  bucket_size: NullableNumber;
  price_bucket_end: NullableNumber;
  price_bucket_label: string | null;
  price_bucket_start: NullableNumber;
  roi_percentage: NullableNumber;
  round_number: number | null;
  scope_key: string;
  scope_type: BundesligaInsightScopeType;
  season: number | null;
  selection_count: number;
  selection_type: string | null;
  team_name: string | null;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  total_goals: number;
  unmatched_count: number;
  win_count: number;
  win_percentage: NullableNumber;
};

type BundesligaInsightType = "fixed_win_single" | "fixed_draw_single" | "half_time_full_time_double" | "same_game_multi_percentage" | "goal_scorer_percentage";

type BundesligaInsightScopeType =
  | "overall"
  | "other_team_price_bucket"
  | "other_team_price_bucket_plus"
  | "favourite_venue"
  | "price_bucket"
  | "price_bucket_plus"
  | "price_difference_bucket"
  | "price_difference_bucket_plus"
  | "selection_type"
  | "team"
  | "season"
  | "season_round"
  | "player"
  | "player_team";

const BUNDESLIGA_INSIGHT_SELECT = [
  "average_return_per_dollar",
  "event_count",
  "insight_type",
  "missing_price_count",
  "missing_result_count",
  "net_return",
  "pending_count",
  "player_name",
  "bucket_size",
  "price_bucket_end",
  "price_bucket_label",
  "price_bucket_start",
  "roi_percentage",
  "round_number",
  "scope_key",
  "scope_type",
  "season",
  "selection_count",
  "selection_type",
  "team_name",
  "total_return",
  "total_stake",
  "total_goals",
  "unmatched_count",
  "win_count",
  "win_percentage",
].join(",");

const FIXED_WIN_SELECTION_ORDER: Record<string, number> = {
  home: 0,
  away: 1,
  favourite: 2,
  favourite_home: 3,
  favourite_away: 4,
};

export const hasSupabaseBundesligaConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads the stored Bundesliga aggregate rows shown in the Bundesliga Insights view.
 */
export async function fetchBundesligaInsights(): Promise<BundesligaInsightsData> {
  const [
    fixedWinOverallRows,
    fixedWinPriceRows,
    fixedWinPricePlusRows,
    fixedWinOtherTeamPriceRows,
    fixedWinOtherTeamPricePlusRows,
    fixedWinPriceDifferenceRows,
    fixedWinPriceDifferencePlusRows,
    fixedWinFavouriteVenueRows,
    fixedWinSelectionRows,
    fixedWinRoundRows,
    fixedDrawOverallRows,
    fixedDrawPriceRows,
    fixedDrawPricePlusRows,
    halfTimeFullTimeOverallRows,
    halfTimeFullTimeFavouriteVenueRows,
    halfTimeFullTimeSelectionRows,
    sameGameOverallRows,
    sameGameRoundRows,
    goalScorerOverallRows,
    goalScorerPlayerRows,
    goalScorerPriceRows,
    goalScorerTeamRows,
  ] = await Promise.all([
    fetchBundesligaAggregateRows("fixed_win_single", "overall", {
      scope_key: "eq.bundesliga:fixed_win_single:overall:favourite",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "price_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "price_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "other_team_price_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "other_team_price_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "price_difference_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "price_difference_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_win_single", "favourite_venue"),
    fetchBundesligaAggregateRows("fixed_win_single", "selection_type"),
    fetchBundesligaAggregateRows("fixed_win_single", "season_round", {
      order: "season.desc,round_number.desc",
    }),
    fetchBundesligaAggregateRows("fixed_draw_single", "overall", {
      scope_key: "eq.bundesliga:fixed_draw_single:overall:draw",
    }),
    fetchBundesligaAggregateRows("fixed_draw_single", "price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("fixed_draw_single", "price_bucket_plus", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("half_time_full_time_double", "overall", {
      scope_key: "eq.bundesliga:half_time_full_time_double:overall:favourite",
    }),
    fetchBundesligaAggregateRows("half_time_full_time_double", "favourite_venue"),
    fetchBundesligaAggregateRows("half_time_full_time_double", "selection_type"),
    fetchBundesligaAggregateRows("same_game_multi_percentage", "overall", {
      scope_key: "eq.bundesliga:same_game_multi_percentage:overall:favourite_top2_goal_scorers",
    }),
    fetchBundesligaAggregateRows("same_game_multi_percentage", "season_round", {
      order: "season.desc,round_number.desc",
    }),
    fetchBundesligaAggregateRows("goal_scorer_percentage", "overall"),
    fetchBundesligaAggregateRows("goal_scorer_percentage", "player", {
      limit: "12",
      order: "win_percentage.desc,selection_count.desc,player_name.asc",
    }),
    fetchBundesligaAggregateRows("goal_scorer_percentage", "price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchBundesligaAggregateRows("goal_scorer_percentage", "team", {
      order: "win_percentage.desc,team_name.asc",
    }),
  ]);
  const fixedWinOverall = fixedWinOverallRows[0] ?? null;
  const fixedDrawOverall = fixedDrawOverallRows[0] ?? null;
  const halfTimeFullTimeOverall = halfTimeFullTimeOverallRows[0] ?? null;
  const sameGameOverall = sameGameOverallRows[0] ?? null;
  const goalScorerOverall = goalScorerOverallRows[0] ?? null;

  return {
    fixedDrawPriceBreakdown: mapPriceBreakdownGroups(fixedDrawPriceRows, mapFixedDrawBreakdown),
    fixedDrawPriceBreakdownPlus: mapPriceBreakdownGroups(fixedDrawPricePlusRows, mapFixedDrawBreakdown),
    fixedDrawSummaryStats: fixedDrawOverall ? mapFixedDrawSummaryStats(fixedDrawOverall) : [],
    fixedWinOtherTeamPriceBreakdown: mapFixedWinPriceBreakdowns(fixedWinOtherTeamPriceRows),
    fixedWinOtherTeamPriceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinOtherTeamPricePlusRows),
    fixedWinPriceDifferenceBreakdown: mapFixedWinPriceBreakdowns(fixedWinPriceDifferenceRows),
    fixedWinPriceDifferenceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinPriceDifferencePlusRows),
    fixedWinPriceBreakdown: mapFixedWinPriceBreakdowns(fixedWinPriceRows),
    fixedWinPriceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinPricePlusRows),
    fixedWinRoundBreakdown: fixedWinRoundRows.map(mapFixedWinBreakdown),
    fixedWinSelectionBreakdown: [
      ...fixedWinSelectionRows,
      ...fixedWinFavouriteVenueRows,
    ]
      .sort(compareFixedWinSelectionRows)
      .map(mapFixedWinBreakdown),
    fixedWinSummaryStats: fixedWinOverall ? mapFixedWinSummaryStats(fixedWinOverall) : [],
    halfTimeFullTimeSelectionBreakdown: [
      ...halfTimeFullTimeSelectionRows,
      ...halfTimeFullTimeFavouriteVenueRows,
    ]
      .sort(compareFixedWinSelectionRows)
      .map(mapHalfTimeFullTimeBreakdown),
    halfTimeFullTimeSummaryStats: halfTimeFullTimeOverall ? mapHalfTimeFullTimeSummaryStats(halfTimeFullTimeOverall) : [],
    sameGameRoundBreakdown: sameGameRoundRows.map(mapSameGameBreakdown),
    sameGameSummaryStats: sameGameOverall ? mapSameGameSummaryStats(sameGameOverall) : [],
    tryScorerPlayerBreakdown: goalScorerPlayerRows.map(mapGoalScorerBreakdown),
    tryScorerPriceBreakdown: mapPriceBreakdownGroups(goalScorerPriceRows, mapGoalScorerBreakdown),
    tryScorerSummaryStats: goalScorerOverall ? mapGoalScorerSummaryStats(goalScorerOverall) : [],
    tryScorerTeamBreakdown: goalScorerTeamRows.map(mapGoalScorerBreakdown),
  };
}

/**
 * Maps the overall fixed-draw row to KPI cards.
 */
function mapFixedDrawSummaryStats(row: BundesligaInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} draws from ${row.selection_count} settled matches`,
      label: "Fixed-draw rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 draw return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.pending_count} pending, ${row.unmatched_count} unmatched, ${row.missing_result_count} missing result`,
      label: "Draw audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Maps the overall HT/FT favourite row to KPI cards.
 */
function mapHalfTimeFullTimeSummaryStats(row: BundesligaInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled favourite HT/FT doubles landed`,
      label: "HT/FT favourite rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 HT/FT return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.pending_count} pending, ${row.unmatched_count} unmatched, ${row.missing_result_count} missing result`,
      label: "HT/FT audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Maps the overall same-game multi row to KPI cards.
 */
function mapSameGameSummaryStats(row: BundesligaInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled favourite-team multis landed`,
      label: "Favourite + 2 scorers",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} estimated return from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 estimated return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.missing_price_count} missing goal-scorer prices, ${row.pending_count} pending`,
      label: "Same-game audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Reads one Bundesliga aggregate scope from Supabase.
 */
async function fetchBundesligaAggregateRows(
  insightType: BundesligaInsightType,
  scopeType: BundesligaInsightScopeType,
  extraParams: Record<string, string> = {},
) {
  return supabaseSelectAll<BundesligaInsightAggregateRow>("bundesliga_insight_aggregates", {
    insight_type: `eq.${insightType}`,
    scope_type: `eq.${scopeType}`,
    select: BUNDESLIGA_INSIGHT_SELECT,
    ...extraParams,
  });
}

/**
 * Maps the overall fixed-win favourite row to KPI cards.
 */
function mapFixedWinSummaryStats(row: BundesligaInsightAggregateRow): FavouriteStat[] {
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
 * Groups fixed-win price buckets by selected role for the Insights toggles.
 */
function mapFixedWinPriceBreakdowns(rows: BundesligaInsightAggregateRow[]): BundesligaFixedWinPriceBreakdownGroups {
  const groups = createFixedWinPriceBreakdownGroups();

  for (const row of rows) {
    if (row.selection_type === "away" || row.selection_type === "favourite" || row.selection_type === "home") {
      groups[getBucketSizeKey(row.bucket_size)][row.selection_type].push(mapFixedWinBreakdown(row));
    }
  }

  return groups;
}

/**
 * Groups non-role price buckets by selected granularity.
 */
function mapPriceBreakdownGroups(
  rows: BundesligaInsightAggregateRow[],
  mapRow: (row: BundesligaInsightAggregateRow) => BundesligaInsightBreakdown,
): BundesligaPriceBreakdownGroups {
  const groups: BundesligaPriceBreakdownGroups = {
    "0.25": [],
    "0.50": [],
  };

  for (const row of rows) {
    groups[getBucketSizeKey(row.bucket_size)].push(mapRow(row));
  }

  return groups;
}

/**
 * Creates empty role groups for each supported price-bucket granularity.
 */
function createFixedWinPriceBreakdownGroups(): BundesligaFixedWinPriceBreakdownGroups {
  return {
    "0.25": {
      away: [],
      favourite: [],
      home: [],
    },
    "0.50": {
      away: [],
      favourite: [],
      home: [],
    },
  };
}

/**
 * Normalizes stored numeric bucket sizes to stable app keys.
 */
function getBucketSizeKey(value: NullableNumber): BundesligaPriceBucketSize {
  return Number(value) === 0.25 ? "0.25" : "0.50";
}

/**
 * Maps the overall goal-scorer row to KPI cards.
 */
function mapGoalScorerSummaryStats(row: BundesligaInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled player appearances included a goal`,
      label: "Anytime goal rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${row.total_goals} goals from official Bundesliga timeline rows`,
      label: "Recorded goals",
      value: String(row.total_goals),
    },
    {
      detail: `${row.pending_count} pending, ${row.missing_result_count} missing result`,
      label: "Appearance rows",
      value: String(row.event_count),
    },
  ];
}

/**
 * Maps a fixed-win aggregate row to the generic Bundesliga breakdown display model.
 */
function mapFixedWinBreakdown(row: BundesligaInsightAggregateRow): BundesligaInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled selections`,
    label: getBundesligaAggregateLabel(row),
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
 * Maps a fixed-draw aggregate row to the generic Bundesliga breakdown display model.
 */
function mapFixedDrawBreakdown(row: BundesligaInsightAggregateRow): BundesligaInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} draws from ${row.selection_count} settled matches`,
    label: getBundesligaAggregateLabel(row),
    netReturn: formatCurrency(numeric(row.net_return)),
    pending: `${row.pending_count} pending`,
    roi: formatPercentage(numeric(row.roi_percentage)),
    selections: `${row.selection_count} matches`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Maps a half-time/full-time aggregate row to the generic Bundesliga breakdown display model.
 */
function mapHalfTimeFullTimeBreakdown(row: BundesligaInsightAggregateRow): BundesligaInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled HT/FT selections`,
    label: getBundesligaAggregateLabel(row),
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
 * Maps a goal-scorer aggregate row to the generic Bundesliga breakdown display model.
 */
function mapGoalScorerBreakdown(row: BundesligaInsightAggregateRow): BundesligaInsightBreakdown {
  if (row.scope_type === "price_bucket") {
    return {
      averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
      detail: `${row.win_count} scored from ${row.selection_count} settled priced selections`,
      label: getBundesligaAggregateLabel(row),
      netReturn: formatCurrency(numeric(row.net_return)),
      pending: `${row.pending_count} pending · ${row.unmatched_count} unmatched`,
      roi: formatPercentage(numeric(row.roi_percentage)),
      selections: `${row.selection_count} selections`,
      totalReturned: formatCurrency(numeric(row.total_return)),
      totalStaked: formatCurrency(numeric(row.total_stake)),
      winRate: formatPercentage(numeric(row.win_percentage)),
    };
  }

  return {
    averageReturn: "No prices",
    detail: `${row.total_goals} goals from ${row.selection_count} settled appearances`,
    label: getBundesligaAggregateLabel(row),
    netReturn: "No prices",
    pending: `${row.pending_count} pending`,
    roi: "No prices",
    selections: `${row.selection_count} appearances`,
    totalReturned: "No prices",
    totalStaked: "No prices",
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Maps a same-game multi aggregate row to the generic Bundesliga breakdown display model.
 */
function mapSameGameBreakdown(row: BundesligaInsightAggregateRow): BundesligaInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled estimated multis`,
    label: getBundesligaAggregateLabel(row),
    netReturn: formatCurrency(numeric(row.net_return)),
    pending: `${row.pending_count} pending · ${row.missing_price_count} missing prices`,
    roi: formatPercentage(numeric(row.roi_percentage)),
    selections: `${row.selection_count} multis`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Builds the most useful display label from a sport-specific aggregate row.
 */
function getBundesligaAggregateLabel(row: BundesligaInsightAggregateRow) {
  if (isBundesligaPriceBucketScope(row.scope_type) && row.price_bucket_label) {
    return row.price_bucket_label;
  }

  if ((row.scope_type === "selection_type" || row.scope_type === "favourite_venue") && row.selection_type) {
    return formatSelectionType(row.selection_type);
  }

  if (row.scope_type === "season_round" && row.season && row.round_number) {
    return `${row.season} round ${row.round_number}`;
  }

  if (row.scope_type === "team" && row.team_name) {
    return row.team_name;
  }

  if (row.scope_type === "player" && row.player_name) {
    return row.player_name;
  }

  return row.scope_key;
}

/**
 * Identifies Bundesliga aggregate scopes that use the shared price bucket fields.
 */
function isBundesligaPriceBucketScope(scopeType: BundesligaInsightScopeType) {
  return scopeType === "price_bucket"
    || scopeType === "price_bucket_plus"
    || scopeType === "other_team_price_bucket"
    || scopeType === "other_team_price_bucket_plus"
    || scopeType === "price_difference_bucket"
    || scopeType === "price_difference_bucket_plus";
}

/**
 * Formats home/away/favourite selection labels for Bundesliga fixed-win rows.
 */
function formatSelectionType(value: string) {
  if (value === "home") {
    return "Home team";
  }

  if (value === "away") {
    return "Away team";
  }

  if (value === "favourite_home") {
    return "Favourite at home";
  }

  if (value === "favourite_away") {
    return "Favourite away";
  }

  return "Favourite";
}

/**
 * Keeps the fixed-win role breakdown in a stable human reading order.
 */
function compareFixedWinSelectionRows(left: BundesligaInsightAggregateRow, right: BundesligaInsightAggregateRow) {
  const leftOrder = left.selection_type ? FIXED_WIN_SELECTION_ORDER[left.selection_type] : undefined;
  const rightOrder = right.selection_type ? FIXED_WIN_SELECTION_ORDER[right.selection_type] : undefined;

  return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
    || String(left.selection_type ?? "").localeCompare(String(right.selection_type ?? ""));
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

/**
 * Converts nullable numeric database values to numbers for display math.
 */
function numeric(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formats a numeric value as a two-decimal dollar return.
 */
function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

/**
 * Formats a numeric value as a signed two-decimal dollar amount.
 */
function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Formats a numeric value as a two-decimal percentage.
 */
function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}
