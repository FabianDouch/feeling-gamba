import type { UfcMultiLeg, UfcMultiRecommendation } from "./promotionPayload";
import type { WinPercentageMultiModelKey } from "./supabasePredictions";
import { supabaseClient } from "./supabaseClient";

type LockedMultiTone = "neutral" | "positive";

export type LockedUfcMultiRecommendation = {
  averageWinScore: number | null;
  combinedFixedWinPrice: number | null;
  id: string;
  legs: UfcMultiLeg[];
  lockedAt: string;
  lockCutoffAt: string | null;
  sourceCardId: string;
  sourceCardName: string;
  sourceDate: string;
  tone: LockedMultiTone;
};

export type LockedUfcMultiInput = {
  averageWinScore: number | null;
  combinedFixedWinPrice: number | null;
  generatedAt: string | null;
  generatedAtNz: string | null;
  legs: UfcMultiLeg[];
  lockCutoffAt: string | null;
  raw: Record<string, unknown>;
  recommendationType: LockedMultiTone;
  source: string;
  sourceCardId: string;
  sourceCardName: string;
  sourceCardSlug: string | null;
  sourceDate: string;
  sourceTimeZone: string;
};

type LockedUfcMultiRow = {
  average_win_score: number | string | null;
  combined_fixed_win_price: number | string | null;
  id: string;
  legs: UfcMultiLeg[];
  locked_at: string;
  lock_cutoff_at: string;
  recommendation_type: LockedMultiTone;
  source_card_id: string;
  source_card_name: string;
  source_date: string;
};

const LOCKED_UFC_MULTI_SELECT = [
  "average_win_score",
  "combined_fixed_win_price",
  "id",
  "legs",
  "locked_at",
  "lock_cutoff_at",
  "recommendation_type",
  "source_card_id",
  "source_card_name",
  "source_date",
].join(",");

/**
 * Reads the user's locked UFC multi for one source date, fight card, and prediction model.
 */
export async function fetchLockedUfcMulti(
  sourceDate: string | null,
  sourceCardId: string | null,
  predictionModel: WinPercentageMultiModelKey,
) {
  if (!sourceDate || !sourceCardId) {
    return null;
  }

  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_locked_ufc_multi_recommendations")
    .select(LOCKED_UFC_MULTI_SELECT)
    .eq("source_date", sourceDate)
    .eq("source_card_id", sourceCardId)
    .eq("prediction_model", predictionModel)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle<LockedUfcMultiRow>();

  if (error) {
    if (isMissingLockedUfcMultiTableError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ? mapLockedUfcMultiRow(data) : null;
}

/**
 * Stores the user's UFC multi lock before the card-level cutoff.
 */
export async function saveLockedUfcMulti(
  input: LockedUfcMultiInput,
  predictionModel: WinPercentageMultiModelKey,
) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to lock this multi.");
  }

  const existing = await fetchLockedUfcMulti(input.sourceDate, input.sourceCardId, predictionModel);

  if (existing) {
    return existing;
  }

  if (!input.lockCutoffAt) {
    throw new Error("This UFC multi does not have a lock cutoff yet.");
  }

  const { data, error } = await supabaseClient
    .from("user_locked_ufc_multi_recommendations")
    .insert({
      average_win_score: input.averageWinScore,
      combined_fixed_win_price: input.combinedFixedWinPrice,
      generated_at: input.generatedAt,
      generated_at_nz: input.generatedAtNz,
      leg_count: input.legs.length,
      legs: input.legs,
      lock_cutoff_at: input.lockCutoffAt,
      prediction_model: predictionModel,
      raw: input.raw,
      recommendation_type: input.recommendationType,
      source: input.source,
      source_card_id: input.sourceCardId,
      source_card_name: input.sourceCardName,
      source_card_slug: input.sourceCardSlug,
      source_date: input.sourceDate,
      source_time_zone: input.sourceTimeZone,
      user_id: userData.user.id,
    })
    .select(LOCKED_UFC_MULTI_SELECT)
    .single<LockedUfcMultiRow>();

  if (error) {
    if (isMissingLockedUfcMultiTableError(error)) {
      throw new Error(
        "Locked UFC multi recommendations are not deployed yet. Apply the latest Supabase migrations and reload the schema cache.",
      );
    }

    if (error.code === "23505") {
      const locked = await fetchLockedUfcMulti(input.sourceDate, input.sourceCardId, predictionModel);

      if (locked) {
        return locked;
      }
    }

    throw new Error(error.message);
  }

  return mapLockedUfcMultiRow(data);
}

/**
 * Builds the lock payload from one live UFC recommendation.
 */
export function createLockedUfcMultiInput(
  payload: {
    generatedAt: string | null;
    generatedAtNz?: string | null;
    sourceDate: string;
    sourceTimeZone?: string;
  },
  source: string,
  recommendation: UfcMultiRecommendation,
): LockedUfcMultiInput {
  return {
    averageWinScore: recommendation.averageWinScore,
    combinedFixedWinPrice: recommendation.combinedFixedWinPrice,
    generatedAt: payload.generatedAt,
    generatedAtNz: payload.generatedAtNz ?? null,
    legs: recommendation.legs,
    lockCutoffAt: recommendation.lockCutoffAt,
    raw: recommendation.raw,
    recommendationType: recommendation.recommendationType,
    source,
    sourceCardId: recommendation.sourceCardId,
    sourceCardName: recommendation.sourceCardName,
    sourceCardSlug: recommendation.sourceCardSlug,
    sourceDate: payload.sourceDate,
    sourceTimeZone: payload.sourceTimeZone ?? "Pacific/Auckland",
  };
}

function mapLockedUfcMultiRow(row: LockedUfcMultiRow): LockedUfcMultiRecommendation {
  return {
    averageWinScore: numeric(row.average_win_score),
    combinedFixedWinPrice: numeric(row.combined_fixed_win_price),
    id: row.id,
    legs: row.legs ?? [],
    lockedAt: row.locked_at,
    lockCutoffAt: row.lock_cutoff_at,
    sourceCardId: row.source_card_id,
    sourceCardName: row.source_card_name,
    sourceDate: row.source_date,
    tone: row.recommendation_type,
  };
}

function numeric(value: number | string | null) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isMissingLockedUfcMultiTableError(error: { code?: string; message?: string }) {
  return error.code === "PGRST205"
    && Boolean(error.message?.includes("user_locked_ufc_multi_recommendations"));
}
