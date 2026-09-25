import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "epl_fixed_win_percentage_single_v1";
export const EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "epl_goal_scorer_percentage_single_v1";

export type EplSinglePredictionModelKey =
  | typeof EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type EplSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: EplSinglePredictionModelKey;
  label: string;
};

export type EplSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: EplSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type EplSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: EplSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const EPL_SINGLE_PREDICTION_MODEL_VARIANTS: EplSinglePredictionModelVariant[] = [
  {
    description: "Ranks current EPL fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current EPL lineups and player goal-scorer prices are not validated yet.",
    key: EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseEplPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Epl singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentEplSinglePredictions(modelKey: EplSinglePredictionModelKey): Promise<EplSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("epl", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
