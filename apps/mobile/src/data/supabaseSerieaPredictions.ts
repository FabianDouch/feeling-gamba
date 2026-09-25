import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const SERIEA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "seriea_fixed_win_percentage_single_v1";
export const SERIEA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "seriea_goal_scorer_percentage_single_v1";

export type SerieaSinglePredictionModelKey =
  | typeof SERIEA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof SERIEA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type SerieaSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: SerieaSinglePredictionModelKey;
  label: string;
};

export type SerieaSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: SerieaSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type SerieaSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: SerieaSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS: SerieaSinglePredictionModelVariant[] = [
  {
    description: "Ranks current Serie A fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: SERIEA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current Serie A lineups and player goal-scorer prices are not validated yet.",
    key: SERIEA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseSerieaPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Seriea singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentSerieaSinglePredictions(modelKey: SerieaSinglePredictionModelKey): Promise<SerieaSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("seriea", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
