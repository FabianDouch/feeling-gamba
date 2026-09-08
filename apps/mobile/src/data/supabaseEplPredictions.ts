import { publicEnv } from "../config/env";

const SUPABASE_PAGE_SIZE = 1000;

type NullableNumber = number | string | null;

export const EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY = "epl_fixed_win_percentage_single_v1";
export const EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY = "epl_goal_scorer_percentage_single_v1";

export type EplSinglePredictionModelKey =
  | typeof EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY
  | typeof EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY;

export type EplSinglePredictionModelVariant = {
  description: string;
  detail: string;
  key: EplSinglePredictionModelKey;
  label: string;
};

export type EplSinglePredictionItem = {
  advertisedStartAt: string | null;
  detail: string;
  id: string;
  matchLabel: string;
  meta: string;
  model: EplSinglePredictionModelKey;
  price: string;
  rank: string;
  score: string;
  signal: string;
  signalTone: "caution" | "neutral" | "positive";
  startLabel: string;
  teamLabel: string;
};

export type EplSinglePredictionsResult = {
  generatedAt: string | null;
  predictions: EplSinglePredictionItem[];
  sourceDate: string | null;
  totalCount: number;
};

type EplSinglePredictionRow = {
  advertised_start_at: string | null;
  bucket_sample_size: number | null;
  id: string;
  lineup_status: string;
  match_label: string | null;
  outcome_status: string;
  predicted_at: string;
  predicted_fixed_win_price: NullableNumber;
  predicted_player_name: string | null;
  predicted_team_name: string | null;
  prediction_model: EplSinglePredictionModelKey;
  prediction_rank: number | null;
  signal_detail: string | null;
  signal_label: string | null;
  signal_tone: "caution" | "neutral" | "positive" | null;
  source_date: string;
  win_score: NullableNumber;
};

export const EPL_SINGLE_PREDICTION_MODEL_VARIANTS: EplSinglePredictionModelVariant[] = [
  {
    description: "Ranks current EPL fixed-win favourites by official 2026 team win percentage.",
    detail: "Uses current fixed-win prices and official season-to-date team results. Historical bookmaker prices are not inferred.",
    key: EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Fixed win %",
  },
  {
    description: "Ranks likely player goal-scorer candidates by official 2026 player/team goal rate.",
    detail: "Uses official appearances and goal events. Current EPL lineups and player goal-scorer prices are not validated yet.",
    key: EPL_GOAL_SCORER_PERCENTAGE_SINGLE_MODEL_KEY,
    label: "Goal scorer %",
  },
];

export const hasSupabaseEplPredictionsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads the latest generated EPL single predictions for one model.
 */
export async function fetchCurrentEplSinglePredictions(
  modelKey: EplSinglePredictionModelKey,
): Promise<EplSinglePredictionsResult> {
  const latestRows = await supabaseSelectAll<{ source_date: string }>("epl_single_predictions", {
    limit: "1",
    order: "source_date.desc,predicted_at.desc",
    prediction_model: `eq.${modelKey}`,
    select: "source_date",
  });
  const sourceDate = latestRows[0]?.source_date ?? null;

  if (!sourceDate) {
    return {
      generatedAt: null,
      predictions: [],
      sourceDate: null,
      totalCount: 0,
    };
  }

  const rows = await supabaseSelectAll<EplSinglePredictionRow>("epl_single_predictions", {
    order: "prediction_rank.asc,advertised_start_at.asc",
    prediction_model: `eq.${modelKey}`,
    select: EPL_SINGLE_PREDICTION_SELECT,
    source_date: `eq.${sourceDate}`,
  });

  return {
    generatedAt: rows[0]?.predicted_at ?? null,
    predictions: rows.map(mapEplSinglePrediction),
    sourceDate,
    totalCount: rows.length,
  };
}

const EPL_SINGLE_PREDICTION_SELECT = [
  "advertised_start_at",
  "bucket_sample_size",
  "id",
  "lineup_status",
  "match_label",
  "outcome_status",
  "predicted_at",
  "predicted_fixed_win_price",
  "predicted_player_name",
  "predicted_team_name",
  "prediction_model",
  "prediction_rank",
  "signal_detail",
  "signal_label",
  "signal_tone",
  "source_date",
  "win_score",
].join(",");

/**
 * Maps one stored EPL prediction row to the card model used in Predictions.
 */
function mapEplSinglePrediction(row: EplSinglePredictionRow): EplSinglePredictionItem {
  const playerPrefix = row.predicted_player_name ? `${row.predicted_player_name} · ` : "";

  return {
    advertisedStartAt: row.advertised_start_at,
    detail: row.signal_detail ?? "No signal detail available.",
    id: row.id,
    matchLabel: row.match_label ?? "EPL match",
    meta: [
      row.lineup_status === "historical_team_roster" ? "historical roster" : null,
      `${row.bucket_sample_size ?? 0} samples`,
      row.outcome_status,
    ].filter(Boolean).join(" · "),
    model: row.prediction_model,
    price: row.predicted_fixed_win_price === null || row.predicted_fixed_win_price === undefined
      ? "No price"
      : `$${numeric(row.predicted_fixed_win_price).toFixed(2)}`,
    rank: `#${row.prediction_rank ?? "-"}`,
    score: `${numeric(row.win_score).toFixed(2)}%`,
    signal: row.signal_label ?? `${numeric(row.win_score).toFixed(2)}%`,
    signalTone: row.signal_tone ?? "neutral",
    startLabel: formatDateTime(row.advertised_start_at),
    teamLabel: `${playerPrefix}${row.predicted_team_name ?? "Unknown team"}`,
  };
}

/**
 * Reads all matching Supabase REST rows across paginated responses.
 */
async function supabaseSelectAll<TRow>(table: string, params: Record<string, string | number>) {
  const rows: TRow[] = [];
  let offset = 0;

  while (true) {
    const page = await supabaseSelectPage<TRow>(table, {
      ...params,
      limit: params.limit ?? SUPABASE_PAGE_SIZE,
      offset,
    });
    rows.push(...page);

    if (page.length < Number(params.limit ?? SUPABASE_PAGE_SIZE)) {
      break;
    }

    offset += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

/**
 * Reads one Supabase REST page for an app-facing table.
 */
async function supabaseSelectPage<TRow>(table: string, params: Record<string, string | number>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} read failed with HTTP ${response.status}`);
  }

  return await response.json() as TRow[];
}

/**
 * Converts nullable database numbers to finite numbers for display.
 */
function numeric(value: NullableNumber) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formats a stored timestamp into the compact date/time label used in cards.
 */
function formatDateTime(value: string | null) {
  if (!value) {
    return "Start TBC";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Pacific/Auckland",
  }).format(new Date(value));
}
