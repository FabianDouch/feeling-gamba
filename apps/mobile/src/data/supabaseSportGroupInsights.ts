import { publicEnv } from "../config/env";
import type { FavouriteStat } from "./collectedRaceDay";
import type {
  NrlFixedWinPriceBreakdownGroups,
  NrlInsightBreakdown,
  NrlInsightsData,
  NrlPriceBreakdownGroups,
  NrlPriceBucketSize,
} from "./supabaseNrl";

const SUPABASE_PAGE_SIZE = 1000;

type NullableNumber = number | string | null;
export type SportInsightGroup = "football" | "rugby_league" | "rugby_union";

export type SportGroupInsightsData = NrlInsightsData & {
  fixedDrawPriceBreakdown: NrlPriceBreakdownGroups;
  fixedDrawPriceBreakdownPlus: NrlPriceBreakdownGroups;
  fixedDrawSummaryStats: FavouriteStat[];
};

type SportGroupInsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  bucket_size: NullableNumber;
  event_count: number;
  insight_type: SportGroupInsightType;
  missing_price_count: number;
  missing_result_count: number;
  net_return: NullableNumber;
  pending_count: number;
  player_name: string | null;
  price_bucket_end: NullableNumber;
  price_bucket_label: string | null;
  price_bucket_start: NullableNumber;
  roi_percentage: NullableNumber;
  scope_key: string;
  scope_type: SportGroupInsightScopeType;
  selection_count: number;
  selection_type: string | null;
  sport_group: SportInsightGroup;
  team_name: string | null;
  total_goals: number;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  total_tries: number;
  unmatched_count: number;
  win_count: number;
  win_percentage: NullableNumber;
};

type SportGroupInsightType =
  | "fixed_win_single"
  | "fixed_draw_single"
  | "goal_scorer_percentage"
  | "half_time_full_time_double"
  | "same_game_multi_percentage"
  | "try_scorer_percentage";

type SportGroupInsightScopeType =
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
  | "player"
  | "player_team";

const SPORT_GROUP_INSIGHT_SELECT = [
  "average_return_per_dollar",
  "bucket_size",
  "event_count",
  "insight_type",
  "missing_price_count",
  "missing_result_count",
  "net_return",
  "pending_count",
  "player_name",
  "price_bucket_end",
  "price_bucket_label",
  "price_bucket_start",
  "roi_percentage",
  "scope_key",
  "scope_type",
  "selection_count",
  "selection_type",
  "sport_group",
  "team_name",
  "total_goals",
  "total_return",
  "total_stake",
  "total_tries",
  "unmatched_count",
  "win_count",
  "win_percentage",
].join(",");

const FIXED_WIN_SELECTION_ORDER: Record<string, number> = {
  favourite: 0,
  underdog: 1,
  home: 2,
  away: 3,
  favourite_home: 4,
  favourite_away: 5,
};

export const hasSupabaseSportGroupInsightsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads stored sport-level aggregate rows for the Insights top-level sport view.
 */
export async function fetchSportGroupInsights(group: SportInsightGroup): Promise<SportGroupInsightsData> {
  const scorerInsightType = group === "football" ? "goal_scorer_percentage" : "try_scorer_percentage";
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
    halfTimeFullTimeOverallRows,
    halfTimeFullTimeFavouriteVenueRows,
    halfTimeFullTimeSelectionRows,
    sameGameOverallRows,
    scorerOverallRows,
    scorerPlayerRows,
    scorerPriceRows,
    scorerTeamRows,
    fixedDrawOverallRows,
    fixedDrawPriceRows,
    fixedDrawPricePlusRows,
  ] = await Promise.all([
    fetchSportGroupAggregateRows(group, "fixed_win_single", "overall"),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "price_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "price_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "other_team_price_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "other_team_price_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "price_difference_bucket", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "price_difference_bucket_plus", {
      order: "selection_type.asc,bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "favourite_venue"),
    fetchSportGroupAggregateRows(group, "fixed_win_single", "selection_type"),
    fetchSportGroupAggregateRows(group, "half_time_full_time_double", "overall"),
    fetchSportGroupAggregateRows(group, "half_time_full_time_double", "favourite_venue"),
    fetchSportGroupAggregateRows(group, "half_time_full_time_double", "selection_type"),
    fetchSportGroupAggregateRows(group, "same_game_multi_percentage", "overall"),
    fetchSportGroupAggregateRows(group, scorerInsightType, "overall"),
    fetchSportGroupAggregateRows(group, scorerInsightType, "player", {
      limit: "12",
      order: "win_percentage.desc,selection_count.desc,player_name.asc",
    }),
    fetchSportGroupAggregateRows(group, scorerInsightType, "price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, scorerInsightType, "team", {
      order: "win_percentage.desc,team_name.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_draw_single", "overall"),
    fetchSportGroupAggregateRows(group, "fixed_draw_single", "price_bucket", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
    fetchSportGroupAggregateRows(group, "fixed_draw_single", "price_bucket_plus", {
      order: "bucket_size.desc,price_bucket_start.asc",
    }),
  ]);
  const fixedWinOverall = fixedWinOverallRows[0] ?? null;
  const halfTimeFullTimeOverall = halfTimeFullTimeOverallRows[0] ?? null;
  const sameGameOverall = sameGameOverallRows[0] ?? null;
  const scorerOverall = scorerOverallRows[0] ?? null;
  const fixedDrawOverall = fixedDrawOverallRows[0] ?? null;

  return {
    fixedDrawPriceBreakdown: mapPriceBreakdownGroups(fixedDrawPriceRows, mapFixedWinBreakdown),
    fixedDrawPriceBreakdownPlus: mapPriceBreakdownGroups(fixedDrawPricePlusRows, mapFixedWinBreakdown),
    fixedDrawSummaryStats: fixedDrawOverall ? mapFixedDrawSummaryStats(fixedDrawOverall) : [],
    fixedWinOtherTeamPriceBreakdown: mapFixedWinPriceBreakdowns(fixedWinOtherTeamPriceRows),
    fixedWinOtherTeamPriceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinOtherTeamPricePlusRows),
    fixedWinPriceDifferenceBreakdown: mapFixedWinPriceBreakdowns(fixedWinPriceDifferenceRows),
    fixedWinPriceDifferenceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinPriceDifferencePlusRows),
    fixedWinPriceBreakdown: mapFixedWinPriceBreakdowns(fixedWinPriceRows),
    fixedWinPriceBreakdownPlus: mapFixedWinPriceBreakdowns(fixedWinPricePlusRows),
    fixedWinRoundBreakdown: [],
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
    sameGameRoundBreakdown: [],
    sameGameSummaryStats: sameGameOverall ? mapSameGameSummaryStats(sameGameOverall, group) : [],
    tryScorerPlayerBreakdown: scorerPlayerRows.map((row) => mapScorerBreakdown(row, group)),
    tryScorerPriceBreakdown: mapPriceBreakdownGroups(scorerPriceRows, (row) => mapScorerBreakdown(row, group)),
    tryScorerSummaryStats: scorerOverall ? mapScorerSummaryStats(scorerOverall, group) : [],
    tryScorerTeamBreakdown: scorerTeamRows.map((row) => mapScorerBreakdown(row, group)),
  };
}

/**
 * Reads one sport-group aggregate scope from Supabase.
 */
function fetchSportGroupAggregateRows(
  group: SportInsightGroup,
  insightType: SportGroupInsightType,
  scopeType: SportGroupInsightScopeType,
  extraParams: Record<string, string> = {},
) {
  return supabaseSelectAll<SportGroupInsightAggregateRow>("sport_group_insight_aggregates", {
    insight_type: `eq.${insightType}`,
    scope_type: `eq.${scopeType}`,
    select: SPORT_GROUP_INSIGHT_SELECT,
    sport_group: `eq.${group}`,
    ...extraParams,
  });
}

/**
 * Maps the overall fixed-win favourite row to KPI cards.
 */
function mapFixedWinSummaryStats(row: SportGroupInsightAggregateRow): FavouriteStat[] {
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
 * Maps the overall fixed-draw row to KPI cards.
 */
function mapFixedDrawSummaryStats(row: SportGroupInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled draw selections`,
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
function mapHalfTimeFullTimeSummaryStats(row: SportGroupInsightAggregateRow): FavouriteStat[] {
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
function mapSameGameSummaryStats(row: SportGroupInsightAggregateRow, group: SportInsightGroup): FavouriteStat[] {
  const scorerLabel = group === "football" ? "scorers" : "try scorers";

  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled favourite-team multis landed`,
      label: `Favourite + 2 ${scorerLabel}`,
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} estimated return from ${formatCurrency(numeric(row.total_stake))} unit stake`,
      label: "$1 estimated return",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${row.missing_price_count} missing scorer prices, ${row.pending_count} pending`,
      label: "Same-game audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Groups fixed-win price buckets by selected role for the Insights toggles.
 */
function mapFixedWinPriceBreakdowns(rows: SportGroupInsightAggregateRow[]): NrlFixedWinPriceBreakdownGroups {
  const groups = createFixedWinPriceBreakdownGroups();

  for (const row of rows) {
    if (row.selection_type === "away" || row.selection_type === "favourite" || row.selection_type === "home" || row.selection_type === "underdog") {
      groups[getBucketSizeKey(row.bucket_size)][row.selection_type].push(mapFixedWinBreakdown(row));
    }
  }

  return groups;
}

/**
 * Groups non-role price buckets by selected granularity.
 */
function mapPriceBreakdownGroups(
  rows: SportGroupInsightAggregateRow[],
  mapRow: (row: SportGroupInsightAggregateRow) => NrlInsightBreakdown,
): NrlPriceBreakdownGroups {
  const groups: NrlPriceBreakdownGroups = {
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
function createFixedWinPriceBreakdownGroups(): NrlFixedWinPriceBreakdownGroups {
  return {
    "0.25": {
      away: [],
      favourite: [],
      home: [],
      underdog: [],
    },
    "0.50": {
      away: [],
      favourite: [],
      home: [],
      underdog: [],
    },
  };
}

/**
 * Normalizes stored numeric bucket sizes to stable app keys.
 */
function getBucketSizeKey(value: NullableNumber): NrlPriceBucketSize {
  return Number(value) === 0.25 ? "0.25" : "0.50";
}

/**
 * Maps the overall scorer row to KPI cards.
 */
function mapScorerSummaryStats(row: SportGroupInsightAggregateRow, group: SportInsightGroup): FavouriteStat[] {
  const isFootball = group === "football";
  const scoreLabel = isFootball ? "goals" : "tries";
  const totalScores = isFootball ? row.total_goals : row.total_tries;

  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled player appearances included a ${isFootball ? "goal" : "try"}`,
      label: `Anytime ${isFootball ? "goal" : "try"} rate`,
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${totalScores} ${scoreLabel} from source-backed timeline rows`,
      label: `Recorded ${scoreLabel}`,
      value: String(totalScores),
    },
    {
      detail: `${row.pending_count} pending, ${row.missing_result_count} missing result`,
      label: "Appearance rows",
      value: String(row.event_count),
    },
  ];
}

/**
 * Maps a fixed-win aggregate row to the shared breakdown display model.
 */
function mapFixedWinBreakdown(row: SportGroupInsightAggregateRow): NrlInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled selections`,
    label: getAggregateLabel(row),
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
 * Maps a half-time/full-time aggregate row to the shared breakdown display model.
 */
function mapHalfTimeFullTimeBreakdown(row: SportGroupInsightAggregateRow): NrlInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled HT/FT selections`,
    label: getAggregateLabel(row),
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
 * Maps a scorer aggregate row to the shared breakdown display model.
 */
function mapScorerBreakdown(row: SportGroupInsightAggregateRow, group: SportInsightGroup): NrlInsightBreakdown {
  const isFootball = group === "football";
  const totalScores = isFootball ? row.total_goals : row.total_tries;
  const scoredLabel = isFootball ? "scored" : "scored";
  const scoreLabel = isFootball ? "goals" : "tries";

  if (row.scope_type === "price_bucket") {
    return {
      averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
      detail: `${row.win_count} ${scoredLabel} from ${row.selection_count} settled priced selections`,
      label: getAggregateLabel(row),
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
    detail: `${totalScores} ${scoreLabel} from ${row.selection_count} settled appearances`,
    label: getAggregateLabel(row),
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
 * Builds the most useful display label from a sport-group aggregate row.
 */
function getAggregateLabel(row: SportGroupInsightAggregateRow) {
  if (isPriceBucketScope(row.scope_type) && row.price_bucket_label) {
    return row.price_bucket_label;
  }

  if ((row.scope_type === "selection_type" || row.scope_type === "favourite_venue") && row.selection_type) {
    return formatSelectionType(row.selection_type);
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
 * Identifies aggregate scopes that use the shared price bucket fields.
 */
function isPriceBucketScope(scopeType: SportGroupInsightScopeType) {
  return scopeType === "price_bucket"
    || scopeType === "price_bucket_plus"
    || scopeType === "other_team_price_bucket"
    || scopeType === "other_team_price_bucket_plus"
    || scopeType === "price_difference_bucket"
    || scopeType === "price_difference_bucket_plus";
}

/**
 * Formats favourite/underdog/home/away selection labels for fixed-win rows.
 */
function formatSelectionType(value: string) {
  if (value === "home") {
    return "Home team";
  }

  if (value === "away") {
    return "Away team";
  }

  if (value === "underdog") {
    return "Underdog";
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
function compareFixedWinSelectionRows(left: SportGroupInsightAggregateRow, right: SportGroupInsightAggregateRow) {
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
 * Converts nullable numeric database values to displayable numbers.
 */
function numeric(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formats percentages consistently with other Insights panels.
 */
function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}

/**
 * Formats decimal returns as currency-style unit returns.
 */
function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

/**
 * Formats signed currency values for aggregate net return rows.
 */
function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
