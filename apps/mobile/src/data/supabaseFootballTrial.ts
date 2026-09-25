import { publicEnv } from "../config/env";

export type FootballHistoryMode = "backtest" | "forward";
export type FootballTrialCohort = "exact_2" | "plus_2";
export type TrialModel = "market" | "bucket" | "rich";
export type FootballHistoryVariationKey = "gap_exact" | "gap_plus" | "market_exact" | "market_plus" | "context_exact" | "context_plus";
export type FootballHistoryVariation = {
  key: FootballHistoryVariationKey; label: string; description: string; detail: string;
  model: TrialModel; cohort: FootballTrialCohort;
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
];

export type TrialSummary = {
  built_at?: string | null;
  recorded: number; pending: number; excluded: number; settled: number; wins: number;
  staked: number; returned: number; net: number; roi: number | null;
  models: { model: TrialModel; recorded: number; unavailable: number; scored: number;
    brier: number | null; paired_market_brier: number | null; log_loss: number | null; paired_market_log_loss: number | null }[];
  calibration: { model: TrialModel; bin: number; sample: number; predicted: number; actual: number }[];
};
export type TrialEntry = {
  id: string; league: string; source_event_id: string; kickoff_at: string; predicted_at: string;
  home_team_name: string; away_team_name: string; favourite_home: boolean;
  favourite_price: number; price_gap: number; market_probability: number;
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
    select: "id,league,source_event_id,kickoff_at,predicted_at,home_team_name,away_team_name,favourite_home,favourite_price,price_gap,market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,outcome_status,won,unit_return",
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

// Match other public sporting read models without relying on a signed-in account.
async function requestTrial(path: string, body?: Record<string, string | null>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) throw new Error("Supabase is not configured.");
  const response = await fetch(new URL(path, publicEnv.supabaseUrl).toString(), {
    method: body ? "POST" : "GET",
    headers: { apikey: publicEnv.supabaseKey, authorization: `Bearer ${publicEnv.supabaseKey}`,
      "content-type": "application/json", prefer: "count=exact" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(response.status === 404
    ? "This football history view has not been activated on this database yet."
    : `Unable to load football trial (HTTP ${response.status}).`);
  return response;
}
