import {
  runRaceDaysAndInsightsRefresh,
} from "../_shared/race-days-refresh-core.mjs";
import {
  normalizeSupabaseProjectUrl,
} from "../_shared/current-promotions-core.mjs";

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-client-info, x-refresh-token",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
};

type RefreshRequestBody = {
  categories?: Array<"HORSE" | "HARNESS" | "GREYHOUND">;
  collectionStart?: string;
  countries?: Array<"AUS" | "HK" | "NZ">;
  coverageMode?: "all_domestic" | "all-domestic" | "pilot";
  dryRun?: boolean;
  force?: boolean;
  from?: string;
  lookbackDays?: number;
  refreshRaceData?: boolean;
  reconcileOutcomes?: boolean;
  rebuildInsights?: boolean;
  to?: string;
};

/**
 * Returns JSON with CORS headers for manual browser or app smoke tests.
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
function getSupabaseConfig() {
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
 * Allows write refreshes only when the caller has the server-side refresh token.
 */
function hasRefreshAuthorization(request: Request) {
  const token = Deno.env.get("RACE_DAY_REFRESH_ADMIN_TOKEN");

  if (!token) {
    throw new Error("RACE_DAY_REFRESH_ADMIN_TOKEN must be configured before hosted race-day refresh writes can run.");
  }

  return request.headers.get("x-refresh-token") === token;
}

/**
 * Parses optional JSON request bodies without requiring cron to send every field.
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

    if (!body.dryRun && !hasRefreshAuthorization(request)) {
      return jsonResponse({ error: "Unauthorized refresh request." }, 401);
    }

    const result = await runRaceDaysAndInsightsRefresh({
      categories: body.categories,
      collectionStart: body.collectionStart,
      config: getSupabaseConfig(),
      countries: body.countries,
      coverageMode: body.coverageMode === "all-domestic" ? "all_domestic" : body.coverageMode,
      dryRun: Boolean(body.dryRun),
      force: Boolean(body.force),
      from: body.from,
      lookbackDays: body.lookbackDays,
      refreshRaceData: body.refreshRaceData !== false,
      reconcileOutcomes: body.reconcileOutcomes !== false,
      rebuildInsights: body.rebuildInsights !== false,
      to: body.to,
      triggeredBy: "edge",
    });

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Race-day refresh failed.",
    }, 500);
  }
});
