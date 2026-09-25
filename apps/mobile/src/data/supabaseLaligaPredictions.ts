import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const LALIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "laliga_fixed_win_percentage_single_v1";
export const LALIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "laliga_goal_scorer_percentage_single_v1";

export type LaligaSinglePredictionModelKey =
  | typeof LALIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof LALIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type LaligaSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: LaligaSinglePredictionModelKey;
  label: string;
};

export type LaligaSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: LaligaSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type LaligaSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: LaligaSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS: LaligaSinglePredictionModelVariant[] = [
  {
    description: "Ranks current La Liga fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: LALIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current La Liga lineups and player goal-scorer prices are not validated yet.",
    key: LALIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseLaligaPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Laliga singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentLaligaSinglePredictions(modelKey: LaligaSinglePredictionModelKey): Promise<LaligaSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("laliga", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
