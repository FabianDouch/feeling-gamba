import { publicEnv } from "../config/env";
import { LEAGUE_OPTIONS } from "../navigation/sportLeagueScope";
import { readCombinedFootballPredictions, readFootballLeaguePredictions, type FootballModelFamily } from "./footballPredictionReader";

export const FOOTBALL_PREDICTION_LEAGUES = LEAGUE_OPTIONS.football.filter((option) => option.value !== "all_football")
  .map((option) => ({ key: option.value, label: option.label }));

// Use only public read credentials; retain HTTP failures as league-specific coverage errors.
async function readFootballRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) throw new Error("Supabase client configuration is missing.");
  const url = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl);
  url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal, headers: { apikey: publicEnv.supabaseKey, authorization: `Bearer ${publicEnv.supabaseKey}` } });
    if (!response.ok) throw new Error(`Prediction read failed (HTTP ${response.status}).`);
    return await response.json() as T[];
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Prediction read timed out. Refresh to retry.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Read the same latest-run contract for cup adapters and existing individual football league readers.
export async function fetchFootballLeaguePredictions(leagueKey: string, family: FootballModelFamily) {
  const league = FOOTBALL_PREDICTION_LEAGUES.find((item) => item.key === leagueKey);
  if (!league) throw new Error("Unsupported football league.");
  return readFootballLeaguePredictions(league, family, readFootballRows);
}

// A null scope includes every configured football league without changing their individual model identities.
export async function fetchCombinedFootballPredictions(family: FootballModelFamily, leagueKey: string | null = null) {
  const leagues = leagueKey === null ? FOOTBALL_PREDICTION_LEAGUES : FOOTBALL_PREDICTION_LEAGUES.filter((item) => item.key === leagueKey);
  if (!leagues.length) throw new Error("Unsupported football league.");
  return readCombinedFootballPredictions(leagues, family, readFootballRows);
}
