import { publicEnv } from "../config/env";

export const FOOTBALL_DRAW_MODEL = "football_draw_v1";
export const THOROUGHBRED_MODEL = "thoroughbred_favourite_v1";
export const FORECAST_PAGE_SIZE = 20;
export const THOROUGHBRED_MODEL_TAB = {
  key: THOROUGHBRED_MODEL,
  label: "Thoroughbred favourite benchmark",
  description: "A win estimate for the saved favourite, based on its recorded price.",
  detail: "Includes the historical win rate for the same 50¢ odds band when enough races are available.",
} as const;
export const FOOTBALL_PROBABILITY_TYPES = [
  { label: "Win %", value: "win_percentage", description: "Favourite win predictions." },
  { label: "Draw %", value: "draw_percentage", description: "Draw forecast and captured TAB odds." },
] as const;

export type ForecastModel = typeof FOOTBALL_DRAW_MODEL | typeof THOROUGHBRED_MODEL;
export type ForecastView = "upcoming" | "history";
type Probabilities = { home?: number; draw?: number; away?: number; win?: number; loss?: number };
export type ModelForecast = {
  id: string;
  sourceGroup: string;
  eventAt: string;
  capturedAt: string;
  forecastAt: string;
  settledAt: string | null;
  prices: { home?: number; draw?: number; away?: number; favourite?: number };
  baseline: Probabilities;
  estimate: Probabilities | null;
  trainingSample: number;
  priceBand: { from: number; toExclusive: number; sample: number; wins: number; winRate: number | null } | null;
  status: "pending" | "settled" | "excluded";
  actual: "home" | "draw" | "away" | "win" | "loss" | null;
  home: string | null;
  away: string | null;
  runner: string | null;
  runnerNumber: number | null;
  course: string | null;
  raceNumber: number | null;
  country: string | null;
};

export type ModelForecastPage = {
  entries: ModelForecast[];
  summary: { total: number; pending: number; settled: number; excluded: number; unavailable: number };
  scores: {
    paired: number; targetOutcomes: number; baselineBrier: number | null; modelBrier: number | null;
    baselineLogLoss: number | null; modelLogLoss: number | null;
  };
  bins: { variant: "baseline" | "model"; bin: number; sample: number; predicted: number; observed: number }[];
};

// Read the narrow public forecast projection without using service credentials in the app.
export async function fetchModelForecasts(model: ForecastModel, view: ForecastView, league: string | null, page: number, signal: AbortSignal): Promise<ModelForecastPage> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) throw new Error("Supabase is not configured.");
  const response = await fetch(new URL("/rest/v1/rpc/get_model_forecasts", publicEnv.supabaseUrl).toString(), {
    method: "POST", signal,
    headers: { apikey: publicEnv.supabaseKey, authorization: `Bearer ${publicEnv.supabaseKey}`, "content-type": "application/json" },
    body: JSON.stringify({ p_model: model, p_view: view, p_league: league, p_page: page }),
  });
  if (!response.ok) throw new Error(response.status === 404
    ? "The forecast feed is not available on this database yet."
    : `Unable to load forecasts (HTTP ${response.status}).`);
  return await response.json() as ModelForecastPage;
}
