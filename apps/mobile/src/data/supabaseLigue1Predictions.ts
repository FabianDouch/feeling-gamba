import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const LIGUE1_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "ligue1_fixed_win_percentage_single_v1";
export const LIGUE1_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "ligue1_goal_scorer_percentage_single_v1";

export type Ligue1SinglePredictionModelKey =
  | typeof LIGUE1_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof LIGUE1_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type Ligue1SinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: Ligue1SinglePredictionModelKey;
  label: string;
};

export type Ligue1SinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: Ligue1SinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type Ligue1SinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: Ligue1SinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS: Ligue1SinglePredictionModelVariant[] = [
  {
    description: "Ranks current Ligue 1 fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: LIGUE1_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current Ligue 1 lineups and player goal-scorer prices are not validated yet.",
    key: LIGUE1_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseLigue1PredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Ligue1 singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentLigue1SinglePredictions(modelKey: Ligue1SinglePredictionModelKey): Promise<Ligue1SinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("ligue1", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
