export type FootballModelFamily = "fixed_win_percentage" | "goal_scorer_percentage";
export type FootballLeagueConfig = { key: string; label: string };
export type FootballPredictionRow = {
  id: string; prediction_model: string; source_date: string; predicted_at: string;
  advertised_start_at: string | null; outcome_status: string; prediction_rank: number | null;
  match_label: string | null; predicted_team_name: string | null; predicted_player_name: string | null;
  predicted_fixed_win_price: number | string | null; win_score: number | string | null;
  signal_label: string | null; signal_detail: string | null; signal_tone: "caution" | "neutral" | "positive" | null;
  bucket_sample_size: number | null; lineup_status: string;
};
export type FootballPredictionItem = {
  id: string; identity: string; league: string; leagueLabel: string; model: string;
  advertisedStartAt: string; sourceDate: string; generatedAt: string;
  matchLabel: string; teamLabel: string; price: string; rank: string; score: string;
  signal: string; signalTone: "caution" | "neutral" | "positive"; detail: string; meta: string; startLabel: string;
};
export type FootballLeaguePredictions = {
  league: string; leagueLabel: string; generatedAt: string | null; sourceDate: string | null;
  stale: boolean; checkedAt: string; predictions: FootballPredictionItem[]; totalCount: number;
};
export type FootballLeagueRead = { league: string; leagueLabel: string; result: FootballLeaguePredictions | null; error: string | null };
export type FootballReadRows = <T>(table: string, params: Record<string, string>) => Promise<T[]>;
const PAGE_SIZE = 1000;
export const FOOTBALL_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const SELECT = "id,prediction_model,source_date,predicted_at,advertised_start_at,outcome_status,prediction_rank,match_label,predicted_team_name,predicted_player_name,predicted_fixed_win_price,win_score,signal_label,signal_detail,signal_tone,bucket_sample_size,lineup_status";

// Exclude started, settled or unscored rows rather than presenting stale results as upcoming predictions.
export function isUpcomingFootballPrediction(row: FootballPredictionRow, now: number): boolean {
  const score = row.win_score === null ? NaN : Number(row.win_score);
  return row.outcome_status === "pending" && row.advertised_start_at !== null
    && Date.parse(row.advertised_start_at) > now && Number.isFinite(score) && score >= 0 && score <= 100;
}

// Retain source model, league rank and missing prices while namespacing identity for combined lists.
function mapFootballPrediction(row: FootballPredictionRow, league: FootballLeagueConfig): FootballPredictionItem {
  const score = `${Number(row.win_score).toFixed(2)}%`;
  const price = row.predicted_fixed_win_price === null ? NaN : Number(row.predicted_fixed_win_price);
  return {
    id: row.id, identity: `${league.key}:${row.prediction_model}:${row.id}`, league: league.key, leagueLabel: league.label,
    model: row.prediction_model, advertisedStartAt: row.advertised_start_at!, sourceDate: row.source_date, generatedAt: row.predicted_at,
    matchLabel: row.match_label ?? `${league.label} match`,
    teamLabel: [row.predicted_player_name, row.predicted_team_name ?? "Unknown team"].filter(Boolean).join(" · "),
    price: Number.isFinite(price) && price > 1 ? `$${price.toFixed(2)}` : "No price",
    rank: `#${row.prediction_rank ?? "-"}`, score, signal: row.signal_label ?? score, signalTone: row.signal_tone ?? "neutral",
    detail: row.signal_detail ?? "No signal detail available.",
    meta: [row.lineup_status === "historical_team_roster" ? "historical roster" : null, `${row.bucket_sample_size ?? 0} samples`, row.outcome_status].filter(Boolean).join(" · "),
    startLabel: new Intl.DateTimeFormat("en-NZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Pacific/Auckland" }).format(new Date(row.advertised_start_at!)),
  };
}

// Order combined rows by kickoff, retaining league rank without claiming a calibrated global score ranking.
export function compareFootballPredictions(a: FootballPredictionItem, b: FootballPredictionItem): number {
  return Date.parse(a.advertisedStartAt) - Date.parse(b.advertisedStartAt) || a.league.localeCompare(b.league) || a.identity.localeCompare(b.identity);
}

// Page one model's latest run completely; the same eligibility rule powers individual and combined views.
export async function readFootballLeaguePredictions(league: FootballLeagueConfig, family: FootballModelFamily, read: FootballReadRows, now = Date.now()): Promise<FootballLeaguePredictions> {
  const table = `${league.key}_single_predictions`;
  const model = `${league.key}_${family}_single_v1`;
  const latest = await read<Pick<FootballPredictionRow, "source_date" | "predicted_at">>(table, {
    select: "source_date,predicted_at", prediction_model: `eq.${model}`, order: "source_date.desc,predicted_at.desc,id.asc", limit: "1",
  });
  const run = latest[0];
  const result: FootballLeaguePredictions = {
    league: league.key, leagueLabel: league.label, sourceDate: run?.source_date ?? null, generatedAt: run?.predicted_at ?? null,
    stale: run ? !Number.isFinite(Date.parse(run.predicted_at)) || now - Date.parse(run.predicted_at) > FOOTBALL_STALE_AFTER_MS : false,
    checkedAt: new Date(now).toISOString(), predictions: [], totalCount: 0,
  };
  if (!run) return result;
  const unique = new Map<string, FootballPredictionItem>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await read<FootballPredictionRow>(table, {
      select: SELECT, prediction_model: `eq.${model}`, source_date: `eq.${run.source_date}`, predicted_at: `eq.${run.predicted_at}`,
      outcome_status: "eq.pending", advertised_start_at: `gt.${result.checkedAt}`,
      order: "advertised_start_at.asc,id.asc", limit: String(PAGE_SIZE), offset: String(offset),
    });
    for (const row of page) {
      if (row.prediction_model === model && isUpcomingFootballPrediction(row, now)) {
        const item = mapFootballPrediction(row, league);
        unique.set(item.identity, item);
      }
    }
    if (page.length < PAGE_SIZE) break;
  }
  result.predictions = [...unique.values()].sort(compareFootballPredictions);
  result.totalCount = result.predictions.length;
  return result;
}

// Isolate league failures and cap concurrent requests so one unavailable source cannot hide the other leagues.
export async function readCombinedFootballPredictions(leagues: readonly FootballLeagueConfig[], family: FootballModelFamily, read: FootballReadRows, now = Date.now()) {
  const coverage: FootballLeagueRead[] = new Array(leagues.length);
  let next = 0;
  // Each worker claims its index before awaiting, keeping deterministic coverage order.
  async function worker() {
    while (next < leagues.length) {
      const index = next++;
      const league = leagues[index];
      try {
        coverage[index] = { league: league.key, leagueLabel: league.label, result: await readFootballLeaguePredictions(league, family, read, now), error: null };
      } catch (error) {
        coverage[index] = { league: league.key, leagueLabel: league.label, result: null, error: error instanceof Error ? error.message : "Prediction read failed." };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, leagues.length) }, worker));
  return { coverage, predictions: coverage.flatMap((entry) => entry.result?.predictions ?? []).sort(compareFootballPredictions), checkedAt: new Date(now).toISOString() };
}
