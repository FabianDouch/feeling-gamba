import { publicEnv } from "../config/env";
import { readFootballForecasts, type FootballForecast } from "./footballForecastReader";

export type FootballHistoryMode = "backtest" | "forward";
export type FootballTrialCohort = "exact_2" | "plus_2" | "opponent_3_50_plus" | "home_opponent_3_50_plus";
export type TrialModel = "market" | "bucket" | "rich" | "blend";
export type FootballHistoryVariationKey = "gap_exact" | "gap_plus" | "market_exact" | "market_plus" | "context_exact" | "context_plus" | "opponent_3_50_plus" | "home_opponent_3_50_plus" | "opponent_blend";
export type FootballHistoryVariation = {
  key: FootballHistoryVariationKey; label: string; description: string; detail: string;
  model: TrialModel; cohort: FootballTrialCohort; experimental?: boolean;
};
export const FOOTBALL_HISTORY_VARIATIONS: FootballHistoryVariation[] = [
  { key: "gap_exact", label: "Price gap $2.00–$2.49", model: "bucket", cohort: "exact_2",
    description: "Favourite win rate from earlier matches with a $2.00–$2.49 price gap.",
    detail: "Requires 30 earlier matches in this gap range. Draws count as losses." },
  { key: "gap_plus", label: "Price gap $2.00+", model: "bucket", cohort: "plus_2",
    description: "Favourite win rate from earlier matches with a price gap of at least $2.00.",
    detail: "Requires 30 earlier matches at or above this gap. Includes the $2.00–$2.49 group." },
  { key: "market_exact", label: "Market odds $2.00–$2.49", model: "market", cohort: "exact_2",
    description: "Market-implied favourite win probability for matches with a $2.00–$2.49 price gap.",
    detail: "Normalises captured home, draw and away prices to remove the combined market margin." },
  { key: "market_plus", label: "Market odds $2.00+", model: "market", cohort: "plus_2",
    description: "Market-implied favourite win probability for matches with a price gap of at least $2.00.",
    detail: "Uses captured home, draw and away prices. Includes the $2.00–$2.49 group." },
  { key: "context_exact", label: "Price gap + context $2.00–$2.49", model: "rich", cohort: "exact_2",
    description: "Favourite win probability using price gap, favourite price, draw probability, venue and league.",
    detail: "For $2.00–$2.49 gaps. Needs 100 earlier matches, 20 from this league, and at least 10 wins and 10 losses." },
  { key: "context_plus", label: "Price gap + context $2.00+", model: "rich", cohort: "plus_2",
    description: "Favourite win probability using price gap, favourite price, draw probability, venue and league.",
    detail: "For gaps of $2.00 or more. Needs 100 earlier matches, 20 from this league, and at least 10 wins and 10 losses." },
  { key: "opponent_3_50_plus", label: "Favourite — opponent $3.50+", model: "market", cohort: "opponent_3_50_plus",
    description: "Selects the shorter-priced team when the opposing team’s win odds are at least $3.50.",
    detail: "No minimum price gap. Probability is market-implied from captured home, draw and away odds. Draws count as losses." },
  { key: "home_opponent_3_50_plus", label: "Trial: Home favourite — opponent $3.50+", model: "market", cohort: "home_opponent_3_50_plus", experimental: true,
    description: "Selects the home team when it is the shorter-priced team and the opponent’s odds are at least $3.50.",
    detail: "Experimental forward trial. No minimum price gap. Probability is market-implied; draws count as losses." },
  { key: "opponent_blend", label: "Trial: Three-model blend — opponent $3.50+", model: "blend", cohort: "opponent_3_50_plus", experimental: true,
    description: "Averages market, historical-rate and context win probabilities equally for favourites with opponent odds of at least $3.50.",
    detail: "Experimental forward trial with no probability cutoff. Requires all three estimates: 30 earlier cohort matches, 100 overall, 20 in this league, and at least 10 wins and 10 losses for context." },
];

export type TrialSummary = {
  built_at?: string | null;
  recorded: number; pending: number; excluded: number; settled: number; wins: number;
  staked: number; returned: number; net: number; roi: number | null;
  models: { wins: number; staked: number; returned: number; net: number; roi: number | null; model: TrialModel; recorded: number; unavailable: number; scored: number;
    brier: number | null; paired_market_brier: number | null; log_loss: number | null; paired_market_log_loss: number | null }[];
  calibration: { model: TrialModel; bin: number; sample: number; predicted: number; actual: number }[];
};
export type TrialEntry = {
  id: string; league: string; source_event_id: string; kickoff_at: string; predicted_at: string;
  home_team_name: string; away_team_name: string; favourite_home: boolean;
  favourite_price: number; other_price: number; price_gap: number; market_probability: number;
  bucket_probability: number | null; rich_probability: number | null;
  bucket_sample: number; rich_sample: number; outcome_status: string; won: boolean | null; unit_return: number | null;
};
export const FOOTBALL_TRIAL_LEAGUES = ["epl", "ucl", "laliga", "bundesliga", "seriea", "ligue1", "mls", "nationsleague", "europaleague", "eflcup"];

// Fetch full-cohort server metrics separately from the bounded, paginated match list.
export async function fetchFootballTrial(league: string | null, cohort: FootballTrialCohort, page = 0, mode: FootballHistoryMode = "backtest") {
  const table = mode === "backtest" ? "football_price_gap_backtests" : "football_price_gap_predictions";
  const rpc = mode === "backtest" ? "get_football_price_gap_backtest_summary" : "get_football_price_gap_summary";
  const entriesUrl = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl ?? "https://unconfigured.invalid");
  const params: Record<string, string> = {
    select: "id,league,source_event_id,kickoff_at,predicted_at,home_team_name,away_team_name,favourite_home,favourite_price,other_price,price_gap,market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,outcome_status,won,unit_return",
    experiment: "eq.football_price_gap_v1", cohort: `eq.${cohort}`,
    order: "kickoff_at.desc,id.desc", offset: String(page * 20), limit: "20",
  };
  if (league) params.league = `eq.${league}`;
  for (const [key, value] of Object.entries(params)) entriesUrl.searchParams.set(key, value);
  const [summaryResponse, entriesResponse] = await Promise.all([
    requestTrial(`/rest/v1/rpc/${rpc}`, { p_league: league, p_cohort: cohort }),
    requestTrial(`${entriesUrl.pathname}${entriesUrl.search}`),
  ]);
  const [summary, entries] = await Promise.all([summaryResponse.json(), entriesResponse.json()]);
  const total = Number(entriesResponse.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error("Trial history count is unavailable.");
  return { summary: summary as TrialSummary, entries: entries as TrialEntry[], total };
}

// Current recommendations read only genuine forward forecasts, never the historical reconstruction table.
export async function fetchUpcomingFootballForecasts(league: string | null, cohort: FootballTrialCohort) {
  if (league && !FOOTBALL_TRIAL_LEAGUES.includes(league)) throw new Error("Unknown football league.");
  const checkedAt = new Date().toISOString();
  const entries = await readFootballForecasts(league, cohort, async (params) => {
    const response = await requestTrial(`/rest/v1/football_price_gap_predictions?${new URLSearchParams(params)}`);
    return await response.json() as FootballForecast[];
  }, Date.parse(checkedAt));
  return { entries: entries.filter((entry) => FOOTBALL_TRIAL_LEAGUES.includes(entry.league)), checkedAt };
}

// Match other public sporting read models without relying on a signed-in account.
async function requestTrial(path: string, body?: Record<string, string | null>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) throw new Error("Supabase is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(new URL(path, publicEnv.supabaseUrl).toString(), {
      signal: controller.signal,
      method: body ? "POST" : "GET",
      headers: { apikey: publicEnv.supabaseKey, authorization: `Bearer ${publicEnv.supabaseKey}`,
        "content-type": "application/json", prefer: "count=exact" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(response.status === 404
    ? "Football forecast storage has not been activated on this database yet."
    : `Unable to load football trial (HTTP ${response.status}).`);
  return response;
}
