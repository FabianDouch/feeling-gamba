import {
  createTrackRaceOddsRequestRow,
  fetchTrackRaceOdds,
  getTodayInSourceTimeZone,
} from "../_shared/track-race-odds-core.mjs";
import {
  createHistoricalStatsFromInsightAggregates,
  normalizeSupabaseProjectUrl,
} from "../_shared/current-promotions-core.mjs";

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-client-info",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
};

type RaceCode = "horse" | "harness" | "greyhound";

type TrackRaceOddsRequestBody = {
  allRaces?: boolean;
  country?: string;
  courseSlug?: string;
  raceCode?: RaceCode;
  raceNumbers?: number[];
  sourceDate?: string;
};

type SupabaseConfig = {
  key: string;
  url: string;
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
 * Writes one request/response audit row to Supabase.
 */
async function insertTrackRaceOddsRequest(config: SupabaseConfig, row: Record<string, unknown>) {
  const response = await fetch(`${config.url}/rest/v1/track_race_odds_requests`, {
    body: JSON.stringify(row),
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Supabase track_race_odds_requests insert failed with HTTP ${response.status}`);
  }
}

/**
 * Loads discipline-scoped historical buckets for matching the Betcha bet-back candidate context.
 */
async function fetchInsightAggregateRows(config: SupabaseConfig, raceCode: RaceCode) {
  const baseSearch = {
    country: "is.null",
    course_slug: "is.null",
    order: "scope_type.asc,starter_count.asc,price_bucket_start.asc",
    scope_type: "in.(starter_count,price_bucket)",
    select: [
      "scope_type",
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
  };

  async function readRows(raceCodeFilter: string) {
    const url = new URL("/rest/v1/insight_aggregates", config.url);

    for (const [key, value] of Object.entries({
      ...baseSearch,
      race_code: raceCodeFilter,
    })) {
      url.searchParams.set(key, value);
    }

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

  const disciplineRows = await readRows(`eq.${raceCode}`);

  return disciplineRows.length ? disciplineRows : await readRows("is.null");
}

/**
 * Parses and validates the app's track odds request, defaulting to the full meeting.
 */
async function readRequestBody(request: Request) {
  const body = await request.json().catch(() => ({})) as TrackRaceOddsRequestBody;
  const raceCode = body.raceCode;

  if (!body.country || !body.courseSlug || !raceCode) {
    throw new Error("country, courseSlug, and raceCode are required.");
  }

  if (!["horse", "harness", "greyhound"].includes(raceCode)) {
    throw new Error("raceCode must be horse, harness, or greyhound.");
  }

  const raceNumbers = body.raceNumbers
    ?.map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return {
    country: body.country,
    courseSlug: body.courseSlug,
    raceCode,
    raceNumbers: body.allRaces ? null : raceNumbers?.length ? raceNumbers : null,
    sourceDate: body.sourceDate ?? getTodayInSourceTimeZone(),
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

  const config = getSupabaseConfig();
  let requestBody: Awaited<ReturnType<typeof readRequestBody>> | null = null;

  try {
    requestBody = await readRequestBody(request);
    const aggregateRows = await fetchInsightAggregateRows(config, requestBody.raceCode);
    const historicalStats = createHistoricalStatsFromInsightAggregates(aggregateRows);
    const payload = await fetchTrackRaceOdds(requestBody, historicalStats);

    await insertTrackRaceOddsRequest(config, createTrackRaceOddsRequestRow({
      payload,
      request: requestBody,
      status: "success",
    }));

    return jsonResponse({
      payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Track race odds request failed.";

    if (requestBody) {
      await insertTrackRaceOddsRequest(config, createTrackRaceOddsRequestRow({
        errorMessage: message,
        payload: {
          fetchedAt: new Date().toISOString(),
          sourceDate: requestBody.sourceDate,
        },
        request: requestBody,
        status: "error",
      })).catch(() => null);
    }

    return jsonResponse({ error: message }, 500);
  }
});
