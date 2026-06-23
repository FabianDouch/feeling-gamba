import {
  rebuildPredictionAggregatesFromSupabase,
} from "../_shared/race-days-refresh-core.mjs";
import {
  createHistoricalStatsFromInsightAggregates,
  generateCurrentPromotionPayload,
  normalizeSupabaseProjectUrl,
  SOURCE_TIME_ZONE,
  upsertPromotionPredictionsToSupabase,
  upsertPromotionSnapshotToSupabase,
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

type CurrentPromotionSnapshotRow = {
  generated_at: string;
  generated_at_nz: string | null;
  payload: unknown;
  source_date: string;
};

type RefreshRequestBody = {
  force?: boolean;
};

/**
 * Returns JSON with CORS headers so Expo web can call the function directly.
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
 * Reads the default secret key shape Supabase exposes in newer Edge Function runtimes.
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
 * Reads Supabase server-side credentials from Edge Function secrets.
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
 * Reads the latest generated promotion cache row so the endpoint can avoid unnecessary source calls.
 */
async function fetchLatestPromotionSnapshot(config: SupabaseConfig) {
  const url = new URL("/rest/v1/current_promotion_snapshots", config.url);
  url.searchParams.set("select", "payload,generated_at,generated_at_nz,source_date");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase current_promotion_snapshots read failed with HTTP ${response.status}`);
  }

  const rows = await response.json() as CurrentPromotionSnapshotRow[];

  return rows[0] ?? null;
}

/**
 * Loads all-country starter and price bucket aggregates for promotion signal comparisons.
 */
async function fetchPromotionInsightAggregateRows(config: SupabaseConfig) {
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
 * Treats the promotion cache as fresh for a short window while live cards are changing.
 */
function isFreshSnapshot(row: CurrentPromotionSnapshotRow | null) {
  if (!row?.generated_at) {
    return false;
  }

  return Date.now() - new Date(row.generated_at).valueOf() < STALE_AFTER_MS;
}

/**
 * Allows force-refresh only when an optional server-side token is configured and matched.
 */
function canForceRefresh(request: Request, body: RefreshRequestBody) {
  if (!body.force) {
    return false;
  }

  const token = Deno.env.get("PROMOTION_REFRESH_ADMIN_TOKEN");

  return Boolean(token && request.headers.get("x-refresh-token") === token);
}

/**
 * Parses optional JSON request bodies without requiring the Expo app to send one.
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
    const latestSnapshot = await fetchLatestPromotionSnapshot(config);

    if (isFreshSnapshot(latestSnapshot) && !canForceRefresh(request, body)) {
      return jsonResponse({
        cached: true,
        generatedAt: latestSnapshot.generated_at,
        generatedAtNz: latestSnapshot.generated_at_nz,
        payload: latestSnapshot.payload,
        sourceDate: latestSnapshot.source_date,
      });
    }

    const aggregateRows = await fetchPromotionInsightAggregateRows(config);
    const historicalStats = createHistoricalStatsFromInsightAggregates(aggregateRows);
    const payload = await generateCurrentPromotionPayload({
      generatedAt: new Date(),
      historicalStats,
    });

    await upsertPromotionSnapshotToSupabase({
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
      error: error instanceof Error ? error.message : "Promotion refresh failed.",
    }, 500);
  }
});
