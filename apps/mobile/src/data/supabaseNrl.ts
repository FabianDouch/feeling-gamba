import { publicEnv } from "../config/env";
import type { FavouriteStat } from "./collectedRaceDay";

const SUPABASE_PAGE_SIZE = 1000;

type NullableNumber = number | string | null;

export type NrlInsightBreakdown = {
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

export type NrlInsightsData = {
  fixedWinPriceBreakdown: NrlInsightBreakdown[];
  fixedWinRoundBreakdown: NrlInsightBreakdown[];
  fixedWinSelectionBreakdown: NrlInsightBreakdown[];
  fixedWinSummaryStats: FavouriteStat[];
  sameGameRoundBreakdown: NrlInsightBreakdown[];
  sameGameSummaryStats: FavouriteStat[];
  tryScorerPlayerBreakdown: NrlInsightBreakdown[];
  tryScorerPriceBreakdown: NrlInsightBreakdown[];
  tryScorerSummaryStats: FavouriteStat[];
  tryScorerTeamBreakdown: NrlInsightBreakdown[];
};

type NrlInsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  event_count: number;
  insight_type: NrlInsightType;
  missing_price_count: number;
  missing_result_count: number;
  net_return: NullableNumber;
  pending_count: number;
  player_name: string | null;
  price_bucket_end: NullableNumber;
  price_bucket_label: string | null;
  price_bucket_start: NullableNumber;
  roi_percentage: NullableNumber;
  round_number: number | null;
  scope_key: string;
  scope_type: NrlInsightScopeType;
  season: number | null;
  selection_count: number;
  selection_type: string | null;
  team_name: string | null;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  total_tries: number;
  unmatched_count: number;
  win_count: number;
  win_percentage: NullableNumber;
};

type NrlInsightType = "fixed_win_single" | "same_game_multi_percentage" | "try_scorer_percentage";

type NrlInsightScopeType =
  | "overall"
  | "price_bucket"
  | "selection_type"
  | "team"
  | "season"
  | "season_round"
  | "player"
  | "player_team";

const NRL_INSIGHT_SELECT = [
  "average_return_per_dollar",
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
  "round_number",
  "scope_key",
  "scope_type",
  "season",
  "selection_count",
  "selection_type",
  "team_name",
  "total_return",
  "total_stake",
  "total_tries",
  "unmatched_count",
  "win_count",
  "win_percentage",
].join(",");

export const hasSupabaseNrlConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads the stored NRL aggregate rows shown in the NRL Insights view.
 */
export async function fetchNrlInsights(): Promise<NrlInsightsData> {
  const [
    fixedWinOverallRows,
    fixedWinPriceRows,
    fixedWinSelectionRows,
    fixedWinRoundRows,
    sameGameOverallRows,
    sameGameRoundRows,
    tryScorerOverallRows,
    tryScorerPlayerRows,
    tryScorerPriceRows,
    tryScorerTeamRows,
  ] = await Promise.all([
    fetchNrlAggregateRows("fixed_win_single", "overall", {
      scope_key: "eq.nrl:fixed_win_single:overall:favourite",
    }),
    fetchNrlAggregateRows("fixed_win_single", "price_bucket", {
      order: "price_bucket_start.asc",
    }),
    fetchNrlAggregateRows("fixed_win_single", "selection_type"),
    fetchNrlAggregateRows("fixed_win_single", "season_round", {
      order: "season.desc,round_number.desc",
    }),
    fetchNrlAggregateRows("same_game_multi_percentage", "overall", {
      scope_key: "eq.nrl:same_game_multi_percentage:overall:favourite_top2_try_scorers",
    }),
    fetchNrlAggregateRows("same_game_multi_percentage", "season_round", {
      order: "season.desc,round_number.desc",
    }),
    fetchNrlAggregateRows("try_scorer_percentage", "overall"),
    fetchNrlAggregateRows("try_scorer_percentage", "player", {
      limit: "12",
      order: "win_percentage.desc,selection_count.desc,player_name.asc",
    }),
    fetchNrlAggregateRows("try_scorer_percentage", "price_bucket", {
      order: "price_bucket_start.asc",
    }),
    fetchNrlAggregateRows("try_scorer_percentage", "team", {
      order: "win_percentage.desc,team_name.asc",
    }),
  ]);
  const fixedWinOverall = fixedWinOverallRows[0] ?? null;
  const sameGameOverall = sameGameOverallRows[0] ?? null;
  const tryScorerOverall = tryScorerOverallRows[0] ?? null;

  return {
    fixedWinPriceBreakdown: fixedWinPriceRows.map(mapFixedWinBreakdown),
    fixedWinRoundBreakdown: fixedWinRoundRows.map(mapFixedWinBreakdown),
    fixedWinSelectionBreakdown: fixedWinSelectionRows.map(mapFixedWinBreakdown),
    fixedWinSummaryStats: fixedWinOverall ? mapFixedWinSummaryStats(fixedWinOverall) : [],
    sameGameRoundBreakdown: sameGameRoundRows.map(mapSameGameBreakdown),
    sameGameSummaryStats: sameGameOverall ? mapSameGameSummaryStats(sameGameOverall) : [],
    tryScorerPlayerBreakdown: tryScorerPlayerRows.map(mapTryScorerBreakdown),
    tryScorerPriceBreakdown: tryScorerPriceRows.map(mapTryScorerBreakdown),
    tryScorerSummaryStats: tryScorerOverall ? mapTryScorerSummaryStats(tryScorerOverall) : [],
    tryScorerTeamBreakdown: tryScorerTeamRows.map(mapTryScorerBreakdown),
  };
}

/**
 * Maps the overall same-game multi row to KPI cards.
 */
function mapSameGameSummaryStats(row: NrlInsightAggregateRow): FavouriteStat[] {
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
      detail: `${row.missing_price_count} missing try-scorer prices, ${row.pending_count} pending`,
      label: "Same-game audit",
      value: String(row.event_count),
    },
  ];
}

/**
 * Reads one NRL aggregate scope from Supabase.
 */
async function fetchNrlAggregateRows(
  insightType: NrlInsightType,
  scopeType: NrlInsightScopeType,
  extraParams: Record<string, string> = {},
) {
  return supabaseSelectAll<NrlInsightAggregateRow>("nrl_insight_aggregates", {
    insight_type: `eq.${insightType}`,
    scope_type: `eq.${scopeType}`,
    select: NRL_INSIGHT_SELECT,
    ...extraParams,
  });
}

/**
 * Maps the overall fixed-win favourite row to KPI cards.
 */
function mapFixedWinSummaryStats(row: NrlInsightAggregateRow): FavouriteStat[] {
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
 * Maps the overall try-scorer row to KPI cards.
 */
function mapTryScorerSummaryStats(row: NrlInsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.win_count} of ${row.selection_count} settled player appearances included a try`,
      label: "Anytime try rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${row.total_tries} tries from official NRL timeline rows`,
      label: "Recorded tries",
      value: String(row.total_tries),
    },
    {
      detail: `${row.pending_count} pending, ${row.missing_result_count} missing result`,
      label: "Appearance rows",
      value: String(row.event_count),
    },
  ];
}

/**
 * Maps a fixed-win aggregate row to the generic NRL breakdown display model.
 */
function mapFixedWinBreakdown(row: NrlInsightAggregateRow): NrlInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled selections`,
    label: getNrlAggregateLabel(row),
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
 * Maps a try-scorer aggregate row to the generic NRL breakdown display model.
 */
function mapTryScorerBreakdown(row: NrlInsightAggregateRow): NrlInsightBreakdown {
  if (row.scope_type === "price_bucket") {
    return {
      averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
      detail: `${row.win_count} scored from ${row.selection_count} settled priced selections`,
      label: getNrlAggregateLabel(row),
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
    detail: `${row.total_tries} tries from ${row.selection_count} settled appearances`,
    label: getNrlAggregateLabel(row),
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
 * Maps a same-game multi aggregate row to the generic NRL breakdown display model.
 */
function mapSameGameBreakdown(row: NrlInsightAggregateRow): NrlInsightBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    detail: `${row.win_count} wins from ${row.selection_count} settled estimated multis`,
    label: getNrlAggregateLabel(row),
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
function getNrlAggregateLabel(row: NrlInsightAggregateRow) {
  if (row.scope_type === "price_bucket" && row.price_bucket_label) {
    return row.price_bucket_label;
  }

  if (row.scope_type === "selection_type" && row.selection_type) {
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
 * Formats home/away/favourite selection labels for NRL fixed-win rows.
 */
function formatSelectionType(value: string) {
  if (value === "home") {
    return "Home";
  }

  if (value === "away") {
    return "Away";
  }

  return "Favourite";
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
