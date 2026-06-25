import {
  rebuildPredictionAggregatesFromSupabase,
} from "../_shared/race-days-refresh-core.mjs";
import {
  createHistoricalStatsFromInsightAggregates,
  generateCurrentPredictionPayload,
  getTodayNzDate,
  isPredictionWindowClosed,
  normalizeSupabaseProjectUrl,
  SOURCE_TIME_ZONE,
  upsertPredictionSnapshotToSupabase,
  upsertPromotionPredictionsToSupabase,
} from "../_shared/current-promotions-core.mjs";

const STALE_AFTER_MS = 15 * 60 * 1000;

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-client-info, x-refresh-token",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
};

type SupabaseConfig = {
  key: string;
  url: string;
};

type CurrentPredictionSnapshotRow = {
  generated_at: string;
  generated_at_nz: string | null;
  payload: unknown;
  source_date: string;
};

type RefreshRequestBody = {
  force?: boolean;
};

/**
 * Serializes API responses with the CORS headers required by the Expo client.
 */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    status,
  });
}

/**
 * Extracts Supabase's hosted default service key shape when custom secrets are unavailable.
 */
function getDefaultSupabaseSecretKey() {
  const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!rawSecretKeys) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSecretKeys) as { default?: string };

    return parsed.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the Supabase project URL and server-side write key for prediction refreshes.
 */
function getSupabaseConfig(): SupabaseConfig {
  const rawUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("EXPO_PUBLIC_SUPABASE_URL");
  const key = Deno.env.get("FEELING_GAMBA_SUPABASE_SECRET_KEY")
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? getDefaultSupabaseSecretKey();

  if (!rawUrl || !key) {
    throw new Error("SUPABASE_URL plus a hosted Supabase secret key or FEELING_GAMBA_SUPABASE_SECRET_KEY must be configured.");
  }

  return {
    key,
    url: normalizeSupabaseProjectUrl(rawUrl),
  };
}

/**
 * Reads the latest prediction snapshot so fresh app-triggered calls can avoid source fetches.
 */
async function fetchLatestPredictionSnapshot(config: SupabaseConfig, sourceDate?: string) {
  const url = new URL("/rest/v1/current_prediction_snapshots", config.url);
  url.searchParams.set("select", "payload,generated_at,generated_at_nz,source_date");
  if (sourceDate) {
    url.searchParams.set("source_date", `eq.${sourceDate}`);
  }
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase current_prediction_snapshots read failed with HTTP ${response.status}`);
  }

  const rows = await response.json() as CurrentPredictionSnapshotRow[];

  return rows[0] ?? null;
}

/**
 * Loads stored historical buckets needed to score every current prediction model.
 */
async function fetchPredictionInsightAggregateRows(config: SupabaseConfig) {
  const url = new URL("/rest/v1/insight_aggregates", config.url);
  url.searchParams.set(
    "select",
    [
      "scope_type",
      "country",
      "race_code",
      "distance_band",
      "track_condition_group",
      "starter_count",
      "price_bucket_label",
      "price_bucket_start",
      "favourite_selections",
      "wins",
      "seconds",
      "thirds",
      "win_percentage",
      "second_percentage",
      "third_percentage",
      "total_stake",
      "total_return",
      "net_return",
      "average_return_per_dollar",
      "total_bonus_credit",
      "total_value_with_bonus_credit",
      "average_value_per_dollar_with_bonus_credit",
      "bonus_credit_percentage",
    ].join(","),
  );
  url.searchParams.set("scope_type", "in.(starter_count,price_bucket,distance_band,track_condition)");
  url.searchParams.set("course_slug", "is.null");
  url.searchParams.set("order", "scope_type.asc,country.asc,race_code.asc,starter_count.asc,price_bucket_start.asc,distance_band.asc,track_condition_group.asc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase insight_aggregates read failed with HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Checks whether the cached prediction payload is still inside the live-racing freshness window.
 */
function isFreshSnapshot(row: CurrentPredictionSnapshotRow | null) {
  if (!row?.generated_at) {
    return false;
  }

  return Date.now() - new Date(row.generated_at).valueOf() < STALE_AFTER_MS;
}

/**
 * Allows forced refreshes only when the configured admin token matches the request header.
 */
function canForceRefresh(request: Request, body: RefreshRequestBody) {
  if (!body.force) {
    return false;
  }

  const token = Deno.env.get("PREDICTION_REFRESH_ADMIN_TOKEN")
    ?? Deno.env.get("PROMOTION_REFRESH_ADMIN_TOKEN");

  return Boolean(token && request.headers.get("x-refresh-token") === token);
}

/**
 * Reads an optional JSON body while keeping plain POST refreshes valid.
 */
async function readRefreshRequestBody(request: Request): Promise<RefreshRequestBody> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  return await request.json().catch(() => ({})) as RefreshRequestBody;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await readRefreshRequestBody(request);
    const config = getSupabaseConfig();
    const sourceDate = getTodayNzDate();
    const latestSnapshot = await fetchLatestPredictionSnapshot(config, sourceDate);

    if (isFreshSnapshot(latestSnapshot) && !canForceRefresh(request, body)) {
      return jsonResponse({
        cached: true,
        generatedAt: latestSnapshot.generated_at,
        generatedAtNz: latestSnapshot.generated_at_nz,
        payload: latestSnapshot.payload,
        sourceDate: latestSnapshot.source_date,
      });
    }

    const aggregateRows = await fetchPredictionInsightAggregateRows(config);
    const historicalStats = createHistoricalStatsFromInsightAggregates(aggregateRows);
    const payload = await generateCurrentPredictionPayload({
      date: sourceDate,
      generatedAt: new Date(),
      historicalStats,
    });

    if (isPredictionWindowClosed(payload)) {
      return jsonResponse({
        cached: Boolean(latestSnapshot),
        generatedAt: latestSnapshot?.generated_at ?? null,
        generatedAtNz: latestSnapshot?.generated_at_nz ?? null,
        payload: latestSnapshot?.payload ?? null,
        predictionWindow: payload.predictionWindow,
        predictionWindowClosed: true,
        skipped: true,
        skippedReason: payload.predictionWindow?.skippedReason ?? "first_race_started",
        sourceDate: payload.sourceDate,
        sourceTimeZone: SOURCE_TIME_ZONE,
      });
    }

    await upsertPredictionSnapshotToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });
    const predictionWrite = await upsertPromotionPredictionsToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });
    const predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
      config,
    });

    return jsonResponse({
      cached: false,
      generatedAt: payload.generatedAt,
      generatedAtNz: payload.generatedAtNz,
      payload,
      predictionAggregateWrite,
      predictionWrite,
      sourceDate: payload.sourceDate,
      sourceTimeZone: SOURCE_TIME_ZONE,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Prediction refresh failed.",
    }, 500);
  }
});
