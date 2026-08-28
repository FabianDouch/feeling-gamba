declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
};

const SOURCE_TIME_ZONE = "Pacific/Auckland";
const FINALISATION_BUFFER_MS = 15 * 60 * 1000;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-client-info, x-refresh-token",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
};

type SupabaseConfig = {
  key: string;
  url: string;
};

type RequestBody = {
  dryRun?: boolean;
  sourceDate?: string;
};

type FavouriteModelRow = {
  id: string;
  model_key: string;
  prediction_format: "singles" | "multis";
  prediction_type: string;
  sport: "nrl" | "pfl" | "racing" | "ufc";
  user_id: string;
};

type PushTokenRow = {
  expo_push_token: string;
  id: string;
  user_id: string;
};

type CurrentPredictionSnapshotRow = {
  generated_at: string;
  payload: Record<string, unknown>;
  source_date: string;
  source_time_zone: string | null;
};

type NotificationEventRow = {
  active_prediction_count: number;
  finalises_at: string;
  id: string;
  model_key: string;
  prediction_format: "singles" | "multis";
  prediction_key: string;
  prediction_type: string;
  source_date: string;
  sport: "nrl" | "pfl" | "racing" | "ufc";
};

type DeliveryRow = {
  id: string;
  push_token_id: string;
  user_id: string;
};

type ActivePredictionEvent = {
  activePredictionCount: number;
  finalisesAt: string;
  modelKey: string;
  payload: Record<string, unknown>;
  predictionFormat: "singles" | "multis";
  predictionKey: string;
  predictionType: string;
  sourceDate: string;
  sourceTimeZone: string;
  sport: "nrl" | "pfl" | "racing" | "ufc";
};

type ExpoTicket = {
  details?: {
    error?: string;
  };
  id?: string;
  message?: string;
  status: "error" | "ok";
};

/**
 * Serializes API responses with CORS headers for manual Edge Function calls.
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
 * Resolves the Supabase project URL and service key for server-side notification work.
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
 * Accepts a project URL or REST URL and returns the Supabase project origin.
 */
function normalizeSupabaseProjectUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    assertAuthorized(request);

    const config = getSupabaseConfig();
    const body = await readRequestBody(request);
    const sourceDate = body.sourceDate ?? getTodayInTimeZone(SOURCE_TIME_ZONE);
    const favourites = await fetchFavouriteModels(config);
    const tokens = await fetchPushTokens(config);
    const tokensByUser = groupTokensByUser(tokens);
    const activeEvents = await findActivePredictionEvents(config, favourites, sourceDate);
    const uniqueEvents = dedupeActiveEvents(activeEvents);
    const dryRunDeliveries = uniqueEvents.reduce((total, event) =>
      total + getInterestedDeliveries(event, favourites, tokensByUser).length, 0);

    if (body.dryRun) {
      return jsonResponse({
        dryRun: true,
        eventCount: uniqueEvents.length,
        events: uniqueEvents,
        sourceDate,
        targetDeliveryCount: dryRunDeliveries,
      });
    }

    const sent = [];

    for (const event of uniqueEvents) {
      const eventRow = await upsertNotificationEvent(config, event);
      const targetDeliveries = getInterestedDeliveries(event, favourites, tokensByUser);
      const queuedDeliveries = await insertQueuedDeliveries(config, eventRow.id, targetDeliveries);
      const sendResult = await sendQueuedDeliveries(config, eventRow, queuedDeliveries, tokens);

      sent.push({
        deliveryCount: queuedDeliveries.length,
        eventId: eventRow.id,
        modelKey: event.modelKey,
        predictionFormat: event.predictionFormat,
        predictionType: event.predictionType,
        sentCount: sendResult.sentCount,
        sourceDate: event.sourceDate,
        sport: event.sport,
      });
    }

    return jsonResponse({
      eventCount: uniqueEvents.length,
      sent,
      sourceDate,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Prediction notification worker failed.",
    }, 500);
  }
});

/**
 * Requires the scheduled caller to provide the configured admin refresh token.
 */
function assertAuthorized(request: Request) {
  const expectedToken = Deno.env.get("PREDICTION_NOTIFICATION_ADMIN_TOKEN")
    ?? Deno.env.get("PREDICTION_REFRESH_ADMIN_TOKEN")
    ?? Deno.env.get("PROMOTION_REFRESH_ADMIN_TOKEN");

  if (!expectedToken) {
    throw new Error("PREDICTION_NOTIFICATION_ADMIN_TOKEN must be configured.");
  }

  if (request.headers.get("x-refresh-token") !== expectedToken) {
    throw new Error("Invalid prediction notification refresh token.");
  }
}

/**
 * Reads an optional JSON body while keeping scheduled plain POST calls valid.
 */
async function readRequestBody(request: Request): Promise<RequestBody> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  return await request.json().catch(() => ({})) as RequestBody;
}

/**
 * Reads enabled model notification favourites.
 */
async function fetchFavouriteModels(config: SupabaseConfig) {
  const url = new URL("/rest/v1/user_favourite_prediction_models", config.url);
  url.searchParams.set("select", "id,user_id,sport,prediction_format,prediction_type,model_key");
  url.searchParams.set("enabled", "eq.true");
  url.searchParams.set("notify_on_finalised", "eq.true");

  return await supabaseGet<FavouriteModelRow[]>(config, url);
}

/**
 * Reads enabled Expo push tokens for all notification users.
 */
async function fetchPushTokens(config: SupabaseConfig) {
  const url = new URL("/rest/v1/user_push_tokens", config.url);
  url.searchParams.set("select", "id,user_id,expo_push_token");
  url.searchParams.set("enabled", "eq.true");

  return await supabaseGet<PushTokenRow[]>(config, url);
}

/**
 * Finds finalised active prediction events for the selected source date.
 */
async function findActivePredictionEvents(
  config: SupabaseConfig,
  favourites: FavouriteModelRow[],
  sourceDate: string,
) {
  const events: ActivePredictionEvent[] = [];
  const snapshot = favourites.some((favourite) => favourite.sport !== "nrl")
    ? await fetchCurrentPredictionSnapshot(config, sourceDate)
    : null;

  for (const favourite of uniqueFavouriteKeys(favourites)) {
    if (favourite.sport === "nrl") {
      const nrlEvent = await findNrlActivePredictionEvent(config, favourite, sourceDate);

      if (nrlEvent) {
        events.push(nrlEvent);
      }
      continue;
    }

    if (!snapshot) {
      continue;
    }

    const snapshotEvent = findSnapshotActivePredictionEvent(snapshot, favourite);

    if (snapshotEvent) {
      events.push(snapshotEvent);
    }
  }

  return events;
}

/**
 * Reads the current mixed prediction snapshot for one NZ source date.
 */
async function fetchCurrentPredictionSnapshot(config: SupabaseConfig, sourceDate: string) {
  const url = new URL("/rest/v1/current_prediction_snapshots", config.url);
  url.searchParams.set("select", "source_date,source_time_zone,generated_at,payload");
  url.searchParams.set("source_date", `eq.${sourceDate}`);
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const rows = await supabaseGet<CurrentPredictionSnapshotRow[]>(config, url);

  return rows[0] ?? null;
}

/**
 * Builds a notification event from the current snapshot when the selected model is finalised and active.
 */
function findSnapshotActivePredictionEvent(
  snapshot: CurrentPredictionSnapshotRow,
  favourite: FavouriteModelRow,
): ActivePredictionEvent | null {
  const payload = snapshot.payload;
  const sourceDate = String(payload.sourceDate ?? snapshot.source_date);
  const sourceTimeZone = String(payload.sourceTimeZone ?? snapshot.source_time_zone ?? SOURCE_TIME_ZONE);
  const finalisesAt = getSnapshotFinalisesAt(payload, favourite.sport);

  if (!isFinalised(finalisesAt)) {
    return null;
  }

  const activePredictionCount = getSnapshotActivePredictionCount(payload, favourite);

  if (activePredictionCount <= 0) {
    return null;
  }

  return {
    activePredictionCount,
    finalisesAt,
    modelKey: favourite.model_key,
    payload: {
      generatedAt: snapshot.generated_at,
      modelKey: favourite.model_key,
      source: "current_prediction_snapshots",
    },
    predictionFormat: favourite.prediction_format,
    predictionKey: "",
    predictionType: favourite.prediction_type,
    sourceDate,
    sourceTimeZone,
    sport: favourite.sport,
  };
}

/**
 * Finds an active NRL single-prediction notification event from persisted prediction rows.
 */
async function findNrlActivePredictionEvent(
  config: SupabaseConfig,
  favourite: FavouriteModelRow,
  sourceDate: string,
): Promise<ActivePredictionEvent | null> {
  if (favourite.prediction_format !== "singles") {
    return null;
  }

  const url = new URL("/rest/v1/nrl_single_predictions", config.url);
  url.searchParams.set("select", "source_date,source_time_zone,advertised_start_at,predicted_at");
  url.searchParams.set("source_date", `eq.${sourceDate}`);
  url.searchParams.set("prediction_model", `eq.${favourite.model_key}`);
  url.searchParams.set("outcome_status", "eq.pending");
  url.searchParams.set("order", "advertised_start_at.asc.nullslast");

  const rows = await supabaseGet<Array<{
    advertised_start_at: string | null;
    predicted_at: string | null;
    source_date: string;
    source_time_zone: string | null;
  }>>(config, url);

  const firstStartAt = getEarliestIsoDate(rows.map((row) => row.advertised_start_at));
  const finalisesAt = getPredictionFinalisesAt(firstStartAt);

  if (!rows.length || !isFinalised(finalisesAt)) {
    return null;
  }

  return {
    activePredictionCount: rows.length,
    finalisesAt,
    modelKey: favourite.model_key,
    payload: {
      generatedAt: rows[0]?.predicted_at ?? null,
      modelKey: favourite.model_key,
      source: "nrl_single_predictions",
    },
    predictionFormat: favourite.prediction_format,
    predictionKey: "",
    predictionType: favourite.prediction_type,
    sourceDate: rows[0]?.source_date ?? sourceDate,
    sourceTimeZone: rows[0]?.source_time_zone ?? SOURCE_TIME_ZONE,
    sport: favourite.sport,
  };
}

/**
 * Resolves the sport-specific finalisation timestamp from the current prediction payload.
 */
function getSnapshotFinalisesAt(payload: Record<string, unknown>, sport: FavouriteModelRow["sport"]) {
  if (sport === "racing") {
    const window = getRecord(payload.predictionWindow);
    const scan = getRecord(payload.betBackCandidates);

    return stringValue(window?.finalisesAt)
      ?? getPredictionFinalisesAt(stringValue(window?.firstRaceStart))
      ?? getPredictionFinalisesAt(stringValue(scan?.firstEligibleRaceStart));
  }

  const fightPayload = getRecord(sport === "ufc"
    ? payload.ufcWinPercentageMultis
    : payload.pflWinPercentageMultis);

  return stringValue(fightPayload?.finalisesAt)
    ?? getPredictionFinalisesAt(stringValue(fightPayload?.firstFightStart))
    ?? getPredictionFinalisesAt(getEarliestFightStart(fightPayload));
}

/**
 * Counts active current predictions for one selected snapshot-backed model.
 */
function getSnapshotActivePredictionCount(payload: Record<string, unknown>, favourite: FavouriteModelRow) {
  if (favourite.sport === "racing") {
    return getRacingActivePredictionCount(payload, favourite);
  }

  return getFightActivePredictionCount(payload, favourite);
}

/**
 * Counts Racing active singles or multis from the mixed current prediction snapshot.
 */
function getRacingActivePredictionCount(payload: Record<string, unknown>, favourite: FavouriteModelRow) {
  const scan = getRecord(payload.betBackCandidates);

  if (!scan) {
    return 0;
  }

  if (favourite.prediction_type === "placing") {
    const candidates = arrayValue(scan.placingCandidates)
      .filter((candidate) => isActivePlacingCandidate(getRecord(candidate)));

    return favourite.prediction_format === "multis"
      ? candidates.length >= 2 ? candidates.length : 0
      : candidates.length;
  }

  if (favourite.prediction_type === "win_percentage") {
    const candidates = arrayValue(scan.winPercentageMultiCandidates)
      .filter((candidate) => isActiveWinPercentageCandidate(getRecord(candidate), favourite.model_key));

    return favourite.prediction_format === "multis"
      ? candidates.length >= 2 ? candidates.length : 0
      : candidates.length;
  }

  const modelRun = arrayValue(scan.models)
    .map((model) => getRecord(model))
    .find((model) => model?.key === favourite.model_key);
  const candidates = arrayValue(modelRun?.candidates ?? scan.candidates)
    .filter((candidate) => isActiveCashCandidate(getRecord(candidate), favourite.model_key));

  return favourite.prediction_format === "multis"
    ? candidates.length >= 2 ? candidates.length : 0
    : candidates.length;
}

/**
 * Counts UFC/PFL active single candidates or same-card multis from the snapshot.
 */
function getFightActivePredictionCount(payload: Record<string, unknown>, favourite: FavouriteModelRow) {
  const fightPayload = getRecord(favourite.sport === "ufc"
    ? payload.ufcWinPercentageMultis
    : payload.pflWinPercentageMultis);
  const modelRun = arrayValue(fightPayload?.models)
    .map((model) => getRecord(model))
    .find((model) => model?.key === favourite.model_key);

  if (!modelRun) {
    return 0;
  }

  if (favourite.prediction_format === "singles") {
    const candidates = arrayValue(modelRun.singleCandidates);

    if (candidates.length) {
      return candidates.length;
    }

    return arrayValue(modelRun.recommendations)
      .flatMap((recommendation) => arrayValue(getRecord(recommendation)?.legs))
      .length;
  }

  return arrayValue(modelRun.recommendations)
    .filter((recommendation) => arrayValue(getRecord(recommendation)?.legs).length >= 2)
    .length;
}

/**
 * Checks whether a racing cash candidate has a priced favourite and a usable signal tone.
 */
function isActiveCashCandidate(candidate: Record<string, unknown> | null, modelKey: string) {
  if (!candidate || !hasFavouriteFixedWinPrice(candidate)) {
    return false;
  }

  const predictionModels = getRecord(candidate.predictionModels);
  const signal = getRecord(predictionModels?.[modelKey]) ?? getRecord(candidate.candidate);
  const tone = stringValue(signal?.tone);

  return tone === "positive" || tone === "neutral";
}

/**
 * Checks whether a racing win-percentage candidate meets the selected threshold model.
 */
function isActiveWinPercentageCandidate(candidate: Record<string, unknown> | null, modelKey: string) {
  if (!candidate || !hasFavouriteFixedWinPrice(candidate)) {
    return false;
  }

  const signal = getWinPercentageSignal(candidate, modelKey);
  const score = numberValue(signal?.winScore ?? signal?.cashAverageScore);

  if (modelKey === "multi_win_percentage_blend_v1") {
    const tone = stringValue(signal?.tone);

    return tone === "positive" || tone === "neutral";
  }

  const threshold = modelKey.includes("60_plus") ? 60 : 65;

  return score !== null && score >= threshold;
}

/**
 * Checks whether a racing placing candidate has an active place market signal.
 */
function isActivePlacingCandidate(candidate: Record<string, unknown> | null) {
  if (!candidate || !hasFavouriteFixedWinPrice(candidate)) {
    return false;
  }

  const signal = getRecord(candidate.placingCandidate);
  const tone = stringValue(signal?.tone);
  const placePayoutDepth = numberValue(signal?.placePayoutDepth);

  return Boolean(
    signal
      && placePayoutDepth
      && placePayoutDepth > 0
      && (tone === "positive" || tone === "neutral"),
  );
}

/**
 * Recomputes model-specific win-percentage signals when a threshold model changes weights.
 */
function getWinPercentageSignal(candidate: Record<string, unknown>, modelKey: string) {
  const baseSignal = getRecord(candidate.winPercentageMultiCandidate);

  if (!baseSignal || modelKey !== "multi_win_percentage_50_50_65_plus_v1") {
    return baseSignal;
  }

  const price = numberValue(baseSignal.priceBucketWinPercentage);
  const starter = numberValue(baseSignal.starterBucketWinPercentage);
  const score = weightedAverage([
    { value: price, weight: 0.5 },
    { value: starter, weight: 0.5 },
  ]);

  return {
    ...baseSignal,
    winScore: score,
  };
}

/**
 * Creates or returns the idempotent event row for a finalised prediction model.
 */
async function upsertNotificationEvent(config: SupabaseConfig, event: ActivePredictionEvent) {
  const url = new URL("/rest/v1/prediction_notification_events", config.url);
  url.searchParams.set(
    "on_conflict",
    "event_type,source_date,sport,prediction_format,prediction_type,model_key,prediction_key",
  );

  const rows = await supabasePost<NotificationEventRow[]>(config, url, [{
    active_prediction_count: event.activePredictionCount,
    event_type: "prediction_finalised",
    finalises_at: event.finalisesAt,
    model_key: event.modelKey,
    payload: event.payload,
    prediction_format: event.predictionFormat,
    prediction_key: event.predictionKey,
    prediction_type: event.predictionType,
    source_date: event.sourceDate,
    source_time_zone: event.sourceTimeZone,
    sport: event.sport,
  }], "resolution=merge-duplicates,return=representation");

  if (!rows[0]) {
    throw new Error("Prediction notification event upsert returned no row.");
  }

  return rows[0];
}

/**
 * Inserts queued delivery rows and returns only rows that were not already sent/queued.
 */
async function insertQueuedDeliveries(
  config: SupabaseConfig,
  eventId: string,
  deliveries: Array<{ pushTokenId: string; userId: string }>,
) {
  if (!deliveries.length) {
    return [];
  }

  const url = new URL("/rest/v1/user_prediction_notifications", config.url);
  url.searchParams.set("on_conflict", "user_id,push_token_id,event_id");

  return await supabasePost<DeliveryRow[]>(config, url, deliveries.map((delivery) => ({
    event_id: eventId,
    push_token_id: delivery.pushTokenId,
    status: "queued",
    user_id: delivery.userId,
  })), "resolution=ignore-duplicates,return=representation");
}

/**
 * Sends Expo push messages for queued delivery rows and records the ticket result.
 */
async function sendQueuedDeliveries(
  config: SupabaseConfig,
  event: NotificationEventRow,
  deliveries: DeliveryRow[],
  tokens: PushTokenRow[],
) {
  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  let sentCount = 0;

  for (const batch of chunk(deliveries, EXPO_BATCH_SIZE)) {
    const missingTokenDeliveries: DeliveryRow[] = [];
    const sendItems: Array<{
      delivery: DeliveryRow;
      message: ReturnType<typeof createExpoMessage>;
      token: PushTokenRow;
    }> = [];

    for (const delivery of batch) {
      const token = tokenById.get(delivery.push_token_id);

      if (token) {
        sendItems.push({
          delivery,
          message: createExpoMessage(event, token.expo_push_token),
          token,
        });
      } else {
        missingTokenDeliveries.push(delivery);
      }
    }

    const messages = sendItems.map((item) => item.message);

    await Promise.all(missingTokenDeliveries.map((delivery) => patchDelivery(config, delivery.id, {
      error: "Push token row was not available for this queued delivery.",
      status: "failed",
    })));

    if (!messages.length) {
      continue;
    }

    const tickets = await sendExpoPushBatch(messages);

    await Promise.all(sendItems.map(async ({ delivery, token }, index) => {
      const ticket = tickets[index];

      if (!ticket) {
        await patchDelivery(config, delivery.id, {
          error: "Expo push API did not return a ticket for this delivery.",
          status: "failed",
        });
        return;
      }

      if (ticket.status === "ok") {
        sentCount += 1;
        await patchDelivery(config, delivery.id, {
          error: null,
          expo_ticket_id: ticket.id ?? null,
          sent_at: new Date().toISOString(),
          status: "sent",
        });
        return;
      }

      const error = ticket.details?.error ?? ticket.message ?? "Expo push send failed.";
      await patchDelivery(config, delivery.id, {
        error,
        status: "failed",
      });

      if (ticket.details?.error === "DeviceNotRegistered") {
        await patchPushToken(config, token.id, {
          enabled: false,
          last_error: error,
        });
      }
    }));
  }

  return { sentCount };
}

/**
 * Sends one Expo push API batch.
 */
async function sendExpoPushBatch(messages: Record<string, unknown>[]) {
  const headers: Record<string, string> = {
    "accept": "application/json",
    "content-type": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(messages),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Expo push API failed with HTTP ${response.status}`);
  }

  const body = await response.json() as { data?: ExpoTicket[] };

  return body.data ?? [];
}

/**
 * Creates the neutral mobile notification payload for one finalised model event.
 */
function createExpoMessage(event: NotificationEventRow, expoPushToken: string) {
  const sportLabel = getSportLabel(event.sport);
  const formatLabel = event.prediction_format === "multis" ? "multi" : "single";
  const modelLabel = formatModelKey(event.model_key);

  return {
    body: `${modelLabel} has ${event.active_prediction_count} active ${formatLabel} prediction${event.active_prediction_count === 1 ? "" : "s"}.`,
    data: {
      modelKey: event.model_key,
      predictionFormat: event.prediction_format,
      predictionType: event.prediction_type,
      sourceDate: event.source_date,
      sport: event.sport,
      type: "prediction_finalised",
    },
    sound: "default",
    title: `${sportLabel} prediction finalised`,
    to: expoPushToken,
  };
}

async function patchDelivery(config: SupabaseConfig, id: string, body: Record<string, unknown>) {
  await supabasePatch(config, `/rest/v1/user_prediction_notifications?id=eq.${id}`, body);
}

async function patchPushToken(config: SupabaseConfig, id: string, body: Record<string, unknown>) {
  await supabasePatch(config, `/rest/v1/user_push_tokens?id=eq.${id}`, body);
}

async function supabaseGet<T>(config: SupabaseConfig, url: URL): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: supabaseHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as T;
}

async function supabasePost<T>(
  config: SupabaseConfig,
  url: URL,
  body: unknown,
  prefer: string,
): Promise<T> {
  const response = await fetch(url.toString(), {
    body: JSON.stringify(body),
    headers: {
      ...supabaseHeaders(config),
      "content-type": "application/json",
      prefer,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as T;
}

async function supabasePatch(config: SupabaseConfig, path: string, body: unknown) {
  const response = await fetch(`${config.url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      ...supabaseHeaders(config),
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Supabase patch failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

function supabaseHeaders(config: SupabaseConfig) {
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
  };
}

function getInterestedDeliveries(
  event: ActivePredictionEvent,
  favourites: FavouriteModelRow[],
  tokensByUser: Map<string, PushTokenRow[]>,
) {
  return favourites
    .filter((favourite) =>
      favourite.sport === event.sport
      && favourite.prediction_format === event.predictionFormat
      && favourite.prediction_type === event.predictionType
      && favourite.model_key === event.modelKey)
    .flatMap((favourite) => (tokensByUser.get(favourite.user_id) ?? []).map((token) => ({
      pushTokenId: token.id,
      userId: favourite.user_id,
    })));
}

function groupTokensByUser(tokens: PushTokenRow[]) {
  const grouped = new Map<string, PushTokenRow[]>();

  for (const token of tokens) {
    grouped.set(token.user_id, [...(grouped.get(token.user_id) ?? []), token]);
  }

  return grouped;
}

function uniqueFavouriteKeys(favourites: FavouriteModelRow[]) {
  const unique = new Map<string, FavouriteModelRow>();

  for (const favourite of favourites) {
    unique.set([
      favourite.sport,
      favourite.prediction_format,
      favourite.prediction_type,
      favourite.model_key,
    ].join(":"), favourite);
  }

  return Array.from(unique.values());
}

function dedupeActiveEvents(events: ActivePredictionEvent[]) {
  const unique = new Map<string, ActivePredictionEvent>();

  for (const event of events) {
    unique.set([
      event.sourceDate,
      event.sport,
      event.predictionFormat,
      event.predictionType,
      event.modelKey,
      event.predictionKey,
    ].join(":"), event);
  }

  return Array.from(unique.values());
}

function getEarliestFightStart(fightPayload: Record<string, unknown> | null) {
  const starts = arrayValue(fightPayload?.models)
    .flatMap((model) => {
      const modelRun = getRecord(model);

      return [
        ...arrayValue(modelRun?.recommendations).map((recommendation) =>
          stringValue(getRecord(recommendation)?.firstFightStart)),
        ...arrayValue(modelRun?.singleCandidates).map((candidate) =>
          stringValue(getRecord(candidate)?.advertisedStart)),
      ];
    });

  return getEarliestIsoDate(starts);
}

function getEarliestIsoDate(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => value ? new Date(value).valueOf() : Number.NaN)
    .filter((value) => Number.isFinite(value));

  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function getPredictionFinalisesAt(firstStart: string | null | undefined) {
  if (!firstStart) {
    return null;
  }

  const startTime = new Date(firstStart).valueOf();

  if (!Number.isFinite(startTime)) {
    return null;
  }

  return new Date(startTime - FINALISATION_BUFFER_MS).toISOString();
}

function isFinalised(finalisesAt: string | null): finalisesAt is string {
  if (!finalisesAt) {
    return false;
  }

  const finalisesAtTime = new Date(finalisesAt).valueOf();

  return Number.isFinite(finalisesAtTime) && Date.now() >= finalisesAtTime;
}

function hasFavouriteFixedWinPrice(candidate: Record<string, unknown>) {
  return numberValue(getRecord(candidate.favourite)?.fixedWinPrice) !== null;
}

function weightedAverage(parts: Array<{ value: number | null; weight: number }>) {
  const available = parts.filter((part) => part.value !== null);
  const totalWeight = available.reduce((total, part) => total + part.weight, 0);

  if (!available.length || totalWeight <= 0) {
    return null;
  }

  return available.reduce((total, part) => total + Number(part.value) * part.weight, 0) / totalWeight;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(number) ? number : null;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getSportLabel(sport: string) {
  if (sport === "ufc" || sport === "pfl" || sport === "nrl") {
    return sport.toUpperCase();
  }

  return "Racing";
}

function formatModelKey(modelKey: string) {
  return modelKey
    .replace(/_v\d+$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
    .replace(/\bUfc\b/u, "UFC")
    .replace(/\bPfl\b/u, "PFL")
    .replace(/\bNrl\b/u, "NRL");
}

function getTodayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}
