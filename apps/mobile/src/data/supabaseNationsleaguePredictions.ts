import { publicEnv } from "../config/env";

import { fetchFootballLeaguePredictions } from "./supabaseFootballPredictions";

export const NATIONSLEAGUE_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "nationsleague_fixed_win_percentage_single_v1";
export const NATIONSLEAGUE_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "nationsleague_goal_scorer_percentage_single_v1";

export type NationsleagueSinglePredictionModelKey =
  | typeof NATIONSLEAGUE_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof NATIONSLEAGUE_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type NationsleagueSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: NationsleagueSinglePredictionModelKey;
  label: string;
};

export type NationsleagueSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: NationsleagueSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type NationsleagueSinglePredictionsResult = {
  generatedAt: string | null;
  stale: boolean;
  checkedAt: string;
  predictions: NationsleagueSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

export const NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS: NationsleagueSinglePredictionModelVariant[] = [
  {
    description: "Ranks current UEFA Nations League fixed-win favourites by stored team win percentage.",
    detail: "Uses captured fixed-win prices and matched official results. Historical bookmaker prices are not inferred.",
    key: NATIONSLEAGUE_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Reserved for source-backed UEFA Nations League goalscorer signals.",
    detail: "Uses official appearances and goal events. Current UEFA Nations League lineups and player goal-scorer prices are not validated yet.",
    key: NATIONSLEAGUE_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseNationsleaguePredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads eligible upcoming Nationsleague singles with the same freshness and paging rules as All Football.
 */
export async function fetchCurrentNationsleagueSinglePredictions(modelKey: NationsleagueSinglePredictionModelKey): Promise<NationsleagueSinglePredictionsResult> {
  const result = await fetchFootballLeaguePredictions("nationsleague", modelKey.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  return { ...result, predictions: result.predictions.map((item) => ({ ...item, model: modelKey })) };
}
