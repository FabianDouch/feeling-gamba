import type { CurrentPredictionType, PredictionFormat, PredictionSport } from "../screens/PredictionControls";
import { supabaseClient } from "./supabaseClient";

export type LockedCurrentPredictionKey = {
  predictionFormat: PredictionFormat;
  predictionModel: string;
  predictionSport: PredictionSport;
  predictionType: CurrentPredictionType;
  sourceDate: string | null;
};

export type LockedCurrentPrediction = {
  generatedAt: string | null;
  generatedAtNz: string | null;
  id: string;
  lockCutoffAt: string;
  lockedAt: string;
  payload: unknown;
  predictionModel: string;
  sourceDate: string;
};

export type LockedCurrentPredictionInput = LockedCurrentPredictionKey & {
  generatedAt: string | null;
  generatedAtNz: string | null;
  lockCutoffAt: string | null;
  payload: unknown;
  sourceTimeZone: string;
};

type LockedCurrentPredictionRow = {
  generated_at: string | null;
  generated_at_nz: string | null;
  id: string;
  lock_cutoff_at: string;
  locked_at: string;
  payload: unknown;
  prediction_model: string;
  source_date: string;
};

const LOCKED_CURRENT_PREDICTION_SELECT = [
  "generated_at",
  "generated_at_nz",
  "id",
  "lock_cutoff_at",
  "locked_at",
  "payload",
  "prediction_model",
  "source_date",
].join(",");

/**
 * Reads the user's locked current prediction view for one sport/model selection.
 */
export async function fetchLockedCurrentPrediction(key: LockedCurrentPredictionKey) {
  if (!key.sourceDate) {
    return null;
  }

  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_locked_current_predictions")
    .select(LOCKED_CURRENT_PREDICTION_SELECT)
    .eq("source_date", key.sourceDate)
    .eq("prediction_sport", key.predictionSport)
    .eq("prediction_format", key.predictionFormat)
    .eq("prediction_type", key.predictionType)
    .eq("prediction_model", key.predictionModel)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle<LockedCurrentPredictionRow>();

  if (error) {
    if (isMissingLockedCurrentPredictionTableError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ? mapLockedCurrentPredictionRow(data) : null;
}

/**
 * Stores the user's current visible prediction view before the sport cutoff.
 */
export async function saveLockedCurrentPrediction(input: LockedCurrentPredictionInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  if (!input.sourceDate) {
    throw new Error("A source date is required before predictions can be locked.");
  }

  if (!input.lockCutoffAt) {
    throw new Error("A finalisation cutoff is required before predictions can be locked.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to lock predictions.");
  }

  const existing = await fetchLockedCurrentPrediction(input);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabaseClient
    .from("user_locked_current_predictions")
    .insert({
      generated_at: input.generatedAt,
      generated_at_nz: input.generatedAtNz,
      lock_cutoff_at: input.lockCutoffAt,
      payload: input.payload,
      prediction_format: input.predictionFormat,
      prediction_model: input.predictionModel,
      prediction_sport: input.predictionSport,
      prediction_type: input.predictionType,
      source_date: input.sourceDate,
      source_time_zone: input.sourceTimeZone,
      user_id: userData.user.id,
    })
    .select(LOCKED_CURRENT_PREDICTION_SELECT)
    .single<LockedCurrentPredictionRow>();

  if (error) {
    if (isMissingLockedCurrentPredictionTableError(error)) {
      throw new Error("Current prediction locks are not deployed yet. Apply the latest Supabase migrations and reload the schema cache.");
    }

    if (error.code === "23505") {
      const locked = await fetchLockedCurrentPrediction(input);

      if (locked) {
        return locked;
      }
    }

    throw new Error(error.message);
  }

  return mapLockedCurrentPredictionRow(data);
}

function mapLockedCurrentPredictionRow(row: LockedCurrentPredictionRow): LockedCurrentPrediction {
  return {
    generatedAt: row.generated_at,
    generatedAtNz: row.generated_at_nz,
    id: row.id,
    lockCutoffAt: row.lock_cutoff_at,
    lockedAt: row.locked_at,
    payload: row.payload,
    predictionModel: row.prediction_model,
    sourceDate: row.source_date,
  };
}

function isMissingLockedCurrentPredictionTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01"
    || String(error.message ?? "").includes("user_locked_current_predictions");
}
