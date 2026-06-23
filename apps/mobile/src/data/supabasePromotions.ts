import { publicEnv } from "../config/env";

export type CurrentPromotionSnapshot<TPayload> = {
  generatedAt: string;
  generatedAtNz: string | null;
  payload: TPayload;
  sourceDate: string;
  sourceTable?: "current_prediction_snapshots" | "current_promotion_snapshots";
};

export const hasSupabasePromotionCacheConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);
export const hasSupabasePredictionCacheConfig = hasSupabasePromotionCacheConfig;

export const hasPromotionRefreshEndpoint = Boolean(publicEnv.promotionRefreshUrl);
export const hasPredictionRefreshEndpoint = Boolean(publicEnv.predictionRefreshUrl);

/**
 * Reads the latest public promotion cache row through Supabase REST.
 */
export async function fetchLatestPromotionSnapshot<TPayload>(): Promise<CurrentPromotionSnapshot<TPayload> | null> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    return null;
  }

  const url = new URL("/rest/v1/current_promotion_snapshots", publicEnv.supabaseUrl);
  url.searchParams.set("select", "payload,generated_at,generated_at_nz,source_date");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase promotion cache read failed with HTTP ${response.status}`);
  }

  const rows = await response.json() as {
    generated_at: string;
    generated_at_nz: string | null;
    payload: TPayload;
    source_date: string;
  }[];

  const row = rows[0];

  return row ? {
    generatedAt: row.generated_at,
    generatedAtNz: row.generated_at_nz,
    payload: row.payload,
    sourceDate: row.source_date,
    sourceTable: "current_promotion_snapshots",
  } satisfies CurrentPromotionSnapshot<TPayload> : null;
}

/**
 * Reads the latest public prediction cache row through Supabase REST.
 * Falls back to the legacy promotion snapshot while the prediction cache is being deployed or seeded.
 */
export async function fetchLatestPredictionSnapshot<TPayload>(): Promise<CurrentPromotionSnapshot<TPayload> | null> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    return null;
  }

  const url = new URL("/rest/v1/current_prediction_snapshots", publicEnv.supabaseUrl);
  url.searchParams.set("select", "payload,generated_at,generated_at_nz,source_date");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
    },
  });

  if (!response.ok) {
    if (await isMissingPredictionSnapshotTable(response)) {
      return await fetchLatestPromotionSnapshot<TPayload>();
    }

    throw new Error(`Supabase prediction cache read failed with HTTP ${response.status}`);
  }

  const rows = await response.json() as {
    generated_at: string;
    generated_at_nz: string | null;
    payload: TPayload;
    source_date: string;
  }[];

  const row = rows[0];

  if (!row) {
    return await fetchLatestPromotionSnapshot<TPayload>();
  }

  return {
    generatedAt: row.generated_at,
    generatedAtNz: row.generated_at_nz,
    payload: row.payload,
    sourceDate: row.source_date,
    sourceTable: "current_prediction_snapshots",
  } satisfies CurrentPromotionSnapshot<TPayload>;
}

/**
 * Identifies PostgREST's schema-cache response when the prediction table has not been deployed.
 */
async function isMissingPredictionSnapshotTable(response: Response) {
  if (response.status !== 404) {
    return false;
  }

  const body = await response.json().catch(() => null) as {
    code?: string;
    message?: string;
  } | null;

  return body?.code === "PGRST205"
    && Boolean(body.message?.includes("current_prediction_snapshots"));
}

/**
 * Requests a server-side promotion refresh without exposing service-role secrets to Expo.
 */
export async function requestPromotionRefresh<TPayload>() {
  if (!publicEnv.promotionRefreshUrl) {
    throw new Error("Promotion refresh endpoint is not configured.");
  }

  const response = await fetch(publicEnv.promotionRefreshUrl, {
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Promotion refresh request failed with HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => null) as {
    payload?: TPayload;
  } | null;

  return body?.payload ?? null;
}

/**
 * Requests a server-side prediction refresh without exposing service-role secrets to Expo.
 */
export async function requestPredictionRefresh<TPayload>() {
  if (!publicEnv.predictionRefreshUrl) {
    throw new Error("Prediction refresh endpoint is not configured.");
  }

  const response = await fetch(publicEnv.predictionRefreshUrl, {
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Prediction refresh request failed with HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => null) as {
    payload?: TPayload;
  } | null;

  return body?.payload ?? null;
}
