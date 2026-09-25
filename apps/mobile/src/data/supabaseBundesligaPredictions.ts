import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const BUNDESLIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "bundesliga_fixed_win_percentage_single_v1";
export const BUNDESLIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "bundesliga_goal_scorer_percentage_single_v1";

export type BundesligaSinglePredictionModelKey =
  | typeof BUNDESLIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof BUNDESLIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type BundesligaSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: BundesligaSinglePredictionModelKey;
  label: string;
};

export type BundesligaSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: BundesligaSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type BundesligaSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: BundesligaSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS: BundesligaSinglePredictionModelVariant[] = [
  {
    description: "Ranks current Bundesliga fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: BUNDESLIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current Bundesliga lineups and player goal-scorer prices are not validated yet.",
    key: BUNDESLIGA_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseBundesligaPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Bundesliga singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentBundesligaSinglePredictions(modelKey: BundesligaSinglePredictionModelKey): Promise<BundesligaSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("bundesliga", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
