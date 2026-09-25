import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const UCL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "ucl_fixed_win_percentage_single_v1";
export const UCL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "ucl_goal_scorer_percentage_single_v1";

export type UclSinglePredictionModelKey =
  | typeof UCL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof UCL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type UclSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: UclSinglePredictionModelKey;
  label: string;
};

export type UclSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: UclSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type UclSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: UclSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const UCL_SINGLE_PREDICTION_MODEL_VARIANTS: UclSinglePredictionModelVariant[] = [
  {
    description: "Ranks current UCL fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: UCL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current UCL lineups and player goal-scorer prices are not validated yet.",
    key: UCL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseUclPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Ucl singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentUclSinglePredictions(modelKey: UclSinglePredictionModelKey): Promise<UclSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("ucl", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
