import type { BetCandidate } from "./promotionPayload";
import {
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  type WinPercentageMultiModelKey,
} from "./supabasePredictions";
import { supabaseClient } from "./supabaseClient";

type LockedMultiTone = "neutral" | "positive";

export type LockedWinPercentageMultiRecommendation = {
  combinedFixedWinPrice: number | null;
  generatedAt: string | null;
  generatedAtNz: string | null;
  id: string;
  legs: BetCandidate[];
  lockCutoffAt: string | null;
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
  lockCutoffAt: string | null;
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
  lock_cutoff_at?: string | null;
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
  "lock_cutoff_at",
  "locked_at",
  "recommendation_type",
  "source_date",
].join(",");
const LOCKED_MULTI_LEGACY_SELECT = [
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
 * Reads the user's locked percentage multi for one source date and model.
 */
export async function fetchLockedWinPercentageMulti(
  sourceDate: string | null,
  predictionModel: WinPercentageMultiModelKey = WIN_PERCENTAGE_MULTI_MODEL_KEY,
) {
  if (!sourceDate) {
    return null;
  }

  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await selectLockedWinPercentageMulti(
    sourceDate,
    predictionModel,
    LOCKED_MULTI_SELECT,
  );

  if (error && isMissingLockCutoffColumnError(error)) {
    const legacyResult = await selectLockedWinPercentageMulti(
      sourceDate,
      predictionModel,
      LOCKED_MULTI_LEGACY_SELECT,
    );

    if (legacyResult.error) {
      if (isMissingLockedMultiTableError(legacyResult.error)) {
        return null;
      }

      throw new Error(legacyResult.error.message);
    }

    return legacyResult.data ? mapLockedWinPercentageMultiRow(legacyResult.data) : null;
  }

  if (error) {
    if (isMissingLockedMultiTableError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ? mapLockedWinPercentageMultiRow(data) : null;
}

/**
 * Reads one lock row using either the current or legacy column list.
 */
async function selectLockedWinPercentageMulti(
  sourceDate: string,
  predictionModel: WinPercentageMultiModelKey,
  selectColumns: string,
) {
  return await supabaseClient!
    .from("user_locked_multi_recommendations")
    .select(selectColumns)
    .eq("source_date", sourceDate)
    .eq("prediction_model", predictionModel)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle<LockedWinPercentageMultiRow>();
}

/**
 * Stores the first percentage multi locked by the signed-in user for the source date and model.
 */
export async function saveLockedWinPercentageMulti(
  input: LockedWinPercentageMultiInput,
  predictionModel: WinPercentageMultiModelKey = WIN_PERCENTAGE_MULTI_MODEL_KEY,
) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to lock this multi.");
  }

  const existing = await fetchLockedWinPercentageMulti(input.sourceDate, predictionModel);

  if (existing) {
    return existing;
  }

  const insertPayload = {
    average_score: input.averageScore,
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
    source_date: input.sourceDate,
    source_time_zone: input.sourceTimeZone,
    user_id: userData.user.id,
  };
  let { data, error } = await supabaseClient
    .from("user_locked_multi_recommendations")
    .insert(insertPayload)
    .select(LOCKED_MULTI_SELECT)
    .single<LockedWinPercentageMultiRow>();

  if (error && isMissingLockCutoffColumnError(error)) {
    const { lock_cutoff_at: _lockCutoffAt, ...legacyInsertPayload } = insertPayload;
    const legacyResult = await supabaseClient
      .from("user_locked_multi_recommendations")
      .insert(legacyInsertPayload)
      .select(LOCKED_MULTI_LEGACY_SELECT)
      .single<LockedWinPercentageMultiRow>();

    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    if (isMissingLockedMultiTableError(error)) {
      throw new Error(
        "Locked multi recommendations are not deployed yet. Apply the latest Supabase migrations and reload the schema cache.",
      );
    }

    if (error.code === "23505") {
      const locked = await fetchLockedWinPercentageMulti(input.sourceDate, predictionModel);

      if (locked) {
        return locked;
      }
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Locked multi recommendation insert did not return a row.");
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
    lockCutoffAt: row.lock_cutoff_at ?? null,
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

function isMissingLockCutoffColumnError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";

  return message.includes("lock_cutoff_at")
    && (
      error.code === "PGRST204"
      || error.code === "42703"
      || message.includes("does not exist")
      || message.includes("Could not find")
    );
}
