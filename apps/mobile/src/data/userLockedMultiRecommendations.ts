import type { BetCandidate } from "./promotionPayload";
import { WIN_PERCENTAGE_MULTI_MODEL_KEY } from "./supabasePredictions";
import { supabaseClient } from "./supabaseClient";

type LockedMultiTone = "neutral" | "positive";

export type LockedWinPercentageMultiRecommendation = {
  combinedFixedWinPrice: number | null;
  generatedAt: string | null;
  generatedAtNz: string | null;
  id: string;
  legs: BetCandidate[];
  lockedAt: string;
  sourceDate: string;
  tone: LockedMultiTone;
};

export type LockedWinPercentageMultiInput = {
  averageScore: number | null;
  combinedFixedWinPrice: number | null;
  generatedAt: string | null;
  generatedAtNz: string | null;
  legs: BetCandidate[];
  raw: Record<string, unknown>;
  recommendationType: LockedMultiTone;
  source: string;
  sourceDate: string;
  sourceTimeZone: string;
};

type LockedWinPercentageMultiRow = {
  combined_fixed_win_price: number | string | null;
  generated_at: string | null;
  generated_at_nz: string | null;
  id: string;
  legs: BetCandidate[];
  locked_at: string;
  recommendation_type: LockedMultiTone;
  source_date: string;
};

const LOCKED_MULTI_SELECT = [
  "combined_fixed_win_price",
  "generated_at",
  "generated_at_nz",
  "id",
  "legs",
  "locked_at",
  "recommendation_type",
  "source_date",
].join(",");

/**
 * Reads the user's locked win-percentage multi for one source date.
 */
export async function fetchLockedWinPercentageMulti(sourceDate: string | null) {
  if (!sourceDate) {
    return null;
  }

  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_locked_multi_recommendations")
    .select(LOCKED_MULTI_SELECT)
    .eq("source_date", sourceDate)
    .eq("prediction_model", WIN_PERCENTAGE_MULTI_MODEL_KEY)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle<LockedWinPercentageMultiRow>();

  if (error) {
    if (isMissingLockedMultiTableError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ? mapLockedWinPercentageMultiRow(data) : null;
}

/**
 * Stores the first win-percentage multi locked by the signed-in user for the source date.
 */
export async function saveLockedWinPercentageMulti(input: LockedWinPercentageMultiInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to lock this multi.");
  }

  const existing = await fetchLockedWinPercentageMulti(input.sourceDate);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabaseClient
    .from("user_locked_multi_recommendations")
    .insert({
      average_score: input.averageScore,
      combined_fixed_win_price: input.combinedFixedWinPrice,
      generated_at: input.generatedAt,
      generated_at_nz: input.generatedAtNz,
      leg_count: input.legs.length,
      legs: input.legs,
      prediction_model: WIN_PERCENTAGE_MULTI_MODEL_KEY,
      raw: input.raw,
      recommendation_type: input.recommendationType,
      source: input.source,
      source_date: input.sourceDate,
      source_time_zone: input.sourceTimeZone,
      user_id: userData.user.id,
    })
    .select(LOCKED_MULTI_SELECT)
    .single<LockedWinPercentageMultiRow>();

  if (error) {
    if (isMissingLockedMultiTableError(error)) {
      throw new Error(
        "Locked multi recommendations are not deployed yet. Apply the latest Supabase migrations and reload the schema cache.",
      );
    }

    if (error.code === "23505") {
      const locked = await fetchLockedWinPercentageMulti(input.sourceDate);

      if (locked) {
        return locked;
      }
    }

    throw new Error(error.message);
  }

  return mapLockedWinPercentageMultiRow(data);
}

function mapLockedWinPercentageMultiRow(
  row: LockedWinPercentageMultiRow,
): LockedWinPercentageMultiRecommendation {
  return {
    combinedFixedWinPrice: numeric(row.combined_fixed_win_price),
    generatedAt: row.generated_at,
    generatedAtNz: row.generated_at_nz,
    id: row.id,
    legs: row.legs ?? [],
    lockedAt: row.locked_at,
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

function isMissingLockedMultiTableError(error: { code?: string; message?: string }) {
  return error.code === "PGRST205"
    && Boolean(error.message?.includes("user_locked_multi_recommendations"));
}
