import {
  rebuildPredictionAggregatesFromSupabase,
} from "../_shared/race-days-refresh-core.mjs";
import {
  createHistoricalStatsFromInsightAggregates,
  createUfcHistoricalStatsFromInsightAggregates,
  generateCurrentPredictionPayload,
  getTodayNzDate,
  isPredictionWindowClosed,
  normalizeSupabaseProjectUrl,
  SOURCE_TIME_ZONE,
  upsertMultiBetRecommendationsToSupabase,
  upsertPredictionSnapshotToSupabase,
  upsertPromotionPredictionsToSupabase,
  upsertUfcMultiRecommendationsToSupabase,
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
  sport?: "racing" | "ufc";
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
      "other_starters_average_price_bucket_end",
      "other_starters_average_price_bucket_label",
      "other_starters_average_price_bucket_start",
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
      "place_eligible_selections",
      "place_hits",
      "total_place_stake",
      "total_place_return",
      "place_net_return",
      "place_average_return_per_dollar",
      "place_percentage",
      "place_roi_percentage",
      "total_bonus_credit",
      "total_value_with_bonus_credit",
      "average_value_per_dollar_with_bonus_credit",
      "bonus_credit_percentage",
    ].join(","),
  );
  url.searchParams.set("scope_type", "in.(starter_count,price_bucket,distance_band,track_condition,other_starters_average_price_bucket)");
  url.searchParams.set("course_slug", "is.null");
  url.searchParams.set("order", "scope_type.asc,country.asc,race_code.asc,starter_count.asc,price_bucket_start.asc,distance_band.asc,other_starters_average_price_bucket_start.asc,track_condition_group.asc");

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
 * Loads UFC price-bucket aggregate rows used by the current UFC multi models.
 */
async function fetchUfcInsightAggregateRows(config: SupabaseConfig) {
  const url = new URL("/rest/v1/ufc_insight_aggregates", config.url);
  url.searchParams.set(
    "select",
    [
      "scope_key",
      "scope_type",
      "price_bucket_label",
      "price_bucket_start",
      "price_bucket_end",
      "fight_count",
      "priced_fight_count",
      "favourite_selections",
      "favourite_wins",
      "favourite_win_percentage",
      "total_stake",
      "total_return",
      "net_return",
      "average_return_per_dollar",
      "roi_percentage",
    ].join(","),
  );
  url.searchParams.set("scope_type", "in.(favourite_price_bucket,other_fighter_price_bucket,price_difference_bucket)");
  url.searchParams.set("order", "scope_type.asc,price_bucket_start.asc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ufc_insight_aggregates read failed with HTTP ${response.status}`);
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

/**
 * Merges a scoped sport refresh into the existing mixed prediction snapshot.
 */
function mergePredictionPayload(
  existingPayload: unknown,
  freshPayload: Record<string, unknown>,
  sport: "racing" | "ufc",
) {
  const existing = existingPayload && typeof existingPayload === "object"
    ? existingPayload as Record<string, unknown>
    : {};
  const existingStatsBasis = existing.statsBasis && typeof existing.statsBasis === "object"
    ? existing.statsBasis as Record<string, unknown>
    : {};
  const freshStatsBasis = freshPayload.statsBasis && typeof freshPayload.statsBasis === "object"
    ? freshPayload.statsBasis as Record<string, unknown>
    : {};
  const existingSummary = existing.summary && typeof existing.summary === "object"
    ? existing.summary as Record<string, unknown>
    : {};
  const freshSummary = freshPayload.summary && typeof freshPayload.summary === "object"
    ? freshPayload.summary as Record<string, unknown>
    : {};

  if (sport === "ufc") {
    return {
      ...existing,
      generatedAt: existing.generatedAt ?? freshPayload.generatedAt,
      generatedAtNz: existing.generatedAtNz ?? freshPayload.generatedAtNz,
      note: freshPayload.note,
      sourceDate: freshPayload.sourceDate,
      sourceTimeZone: freshPayload.sourceTimeZone,
      statsBasis: {
        ...existingStatsBasis,
        ufcBasisLabel: freshStatsBasis.ufcBasisLabel,
        ufcFavouritePriceBucketCount: freshStatsBasis.ufcFavouritePriceBucketCount,
        ufcOtherFighterPriceBucketCount: freshStatsBasis.ufcOtherFighterPriceBucketCount,
        ufcPriceDifferenceBucketCount: freshStatsBasis.ufcPriceDifferenceBucketCount,
      },
      summary: {
        ...existingSummary,
        ufcRecommendations: freshSummary.ufcRecommendations,
      },
      ufcGeneratedAt: freshPayload.ufcGeneratedAt ?? freshPayload.generatedAt,
      ufcGeneratedAtNz: freshPayload.ufcGeneratedAtNz ?? freshPayload.generatedAtNz,
      ufcWinPercentageMultis: freshPayload.ufcWinPercentageMultis,
    };
  }

  return {
    ...freshPayload,
    statsBasis: {
      ...freshStatsBasis,
      ufcBasisLabel: existingStatsBasis.ufcBasisLabel ?? null,
      ufcFavouritePriceBucketCount: existingStatsBasis.ufcFavouritePriceBucketCount ?? 0,
      ufcOtherFighterPriceBucketCount: existingStatsBasis.ufcOtherFighterPriceBucketCount ?? 0,
      ufcPriceDifferenceBucketCount: existingStatsBasis.ufcPriceDifferenceBucketCount ?? 0,
    },
    summary: {
      ...freshSummary,
      ufcRecommendations: existingSummary.ufcRecommendations ?? 0,
    },
    ufcGeneratedAt: existing.ufcGeneratedAt ?? null,
    ufcGeneratedAtNz: existing.ufcGeneratedAtNz ?? null,
    ufcWinPercentageMultis: existing.ufcWinPercentageMultis ?? null,
  };
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

    if (!body.sport && isFreshSnapshot(latestSnapshot) && !canForceRefresh(request, body)) {
      return jsonResponse({
        cached: true,
        generatedAt: latestSnapshot.generated_at,
        generatedAtNz: latestSnapshot.generated_at_nz,
        payload: latestSnapshot.payload,
        sourceDate: latestSnapshot.source_date,
      });
    }

    if (body.sport === "ufc") {
      const ufcAggregateRows = await fetchUfcInsightAggregateRows(config);
      const ufcHistoricalStats = createUfcHistoricalStatsFromInsightAggregates(ufcAggregateRows);
      const freshPayload = await generateCurrentPredictionPayload({
        date: sourceDate,
        generatedAt: new Date(),
        includeRacing: false,
        includeUfc: true,
        ufcHistoricalStats,
      }) as Record<string, unknown>;
      const payload = mergePredictionPayload(latestSnapshot?.payload ?? null, freshPayload, "ufc");

      const ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });
      await upsertPredictionSnapshotToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });

      return jsonResponse({
        cached: false,
        generatedAt: payload.generatedAt,
        generatedAtNz: payload.generatedAtNz,
        payload,
        sourceDate: payload.sourceDate,
        sourceTimeZone: SOURCE_TIME_ZONE,
        sport: body.sport,
        ufcMultiRecommendationWrite,
      });
    }

    if (body.sport === "racing") {
      const aggregateRows = await fetchPredictionInsightAggregateRows(config);
      const historicalStats = createHistoricalStatsFromInsightAggregates(aggregateRows);
      const freshPayload = await generateCurrentPredictionPayload({
        date: sourceDate,
        generatedAt: new Date(),
        historicalStats,
        includeRacing: true,
        includeUfc: false,
      }) as Record<string, unknown>;
      const payload = mergePredictionPayload(latestSnapshot?.payload ?? null, freshPayload, "racing");

      if (isPredictionWindowClosed(freshPayload)) {
        return jsonResponse({
          cached: Boolean(latestSnapshot),
          generatedAt: latestSnapshot?.generated_at ?? null,
          generatedAtNz: latestSnapshot?.generated_at_nz ?? null,
          payload: latestSnapshot?.payload ?? null,
          predictionWindow: freshPayload.predictionWindow,
          predictionWindowClosed: true,
          skipped: true,
          skippedReason: (freshPayload.predictionWindow as { skippedReason?: string | null } | undefined)?.skippedReason ?? "first_race_started",
          sourceDate: freshPayload.sourceDate,
          sourceTimeZone: SOURCE_TIME_ZONE,
          sport: body.sport,
        });
      }

      const predictionWrite = await upsertPromotionPredictionsToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });
      const multiBetRecommendationWrite = await upsertMultiBetRecommendationsToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });
      const predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
        config,
      });
      await upsertPredictionSnapshotToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });

      return jsonResponse({
        cached: false,
        generatedAt: payload.generatedAt,
        generatedAtNz: payload.generatedAtNz,
        payload,
        multiBetRecommendationWrite,
        predictionAggregateWrite,
        predictionWrite,
        sourceDate: payload.sourceDate,
        sourceTimeZone: SOURCE_TIME_ZONE,
        sport: body.sport,
      });
    }

    const [aggregateRows, ufcAggregateRows] = await Promise.all([
      fetchPredictionInsightAggregateRows(config),
      fetchUfcInsightAggregateRows(config),
    ]);
    const historicalStats = createHistoricalStatsFromInsightAggregates(aggregateRows);
    const ufcHistoricalStats = createUfcHistoricalStatsFromInsightAggregates(ufcAggregateRows);
    const payload = await generateCurrentPredictionPayload({
      date: sourceDate,
      generatedAt: new Date(),
      historicalStats,
      ufcHistoricalStats,
    });

    if (isPredictionWindowClosed(payload)) {
      const ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
        output: payload,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });

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
        ufcMultiRecommendationWrite,
      });
    }

    const predictionWrite = await upsertPromotionPredictionsToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });
    const multiBetRecommendationWrite = await upsertMultiBetRecommendationsToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });
    const ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });
    const predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
      config,
    });
    await upsertPredictionSnapshotToSupabase({
      output: payload,
      supabaseKey: config.key,
      supabaseUrl: config.url,
    });

    return jsonResponse({
      cached: false,
      generatedAt: payload.generatedAt,
      generatedAtNz: payload.generatedAtNz,
      payload,
      multiBetRecommendationWrite,
      predictionAggregateWrite,
      predictionWrite,
      sourceDate: payload.sourceDate,
      sourceTimeZone: SOURCE_TIME_ZONE,
      ufcMultiRecommendationWrite,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Prediction refresh failed.",
    }, 500);
  }
});
