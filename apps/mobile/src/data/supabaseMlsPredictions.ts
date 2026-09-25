import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const MLS_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "mls_fixed_win_percentage_single_v1";
export const MLS_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "mls_goal_scorer_percentage_single_v1";

export type MlsSinglePredictionModelKey =
  | typeof MLS_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof MLS_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type MlsSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: MlsSinglePredictionModelKey;
  label: string;
};

export type MlsSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: MlsSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type MlsSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: MlsSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const MLS_SINGLE_PREDICTION_MODEL_VARIANTS: MlsSinglePredictionModelVariant[] = [
  {
    description: "Ranks current MLS fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: MLS_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current MLS lineups and player goal-scorer prices are not validated yet.",
    key: MLS_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseMlsPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Mls singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentMlsSinglePredictions(modelKey: MlsSinglePredictionModelKey): Promise<MlsSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("mls", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
