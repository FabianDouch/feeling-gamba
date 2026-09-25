import type { FootballHistoryVariation, TrialEntry } from "./supabaseFootballTrial";

export type FootballForecast = TrialEntry & { experiment: string; cohort: string; snapshot_at: string };
type ReadForecastPage = (params: Record<string, string>) => Promise<FootballForecast[]>;

// Read every page from frozen forward forecasts; a failed page fails the whole read rather than hiding missing recommendations.
export async function readFootballForecasts(league: string | null, cohort: string, read: ReadForecastPage, now = Date.now()) {
  const entries = new Map<string, FootballForecast>();
  for (let offset = 0; ; offset += 1000) {
    const params: Record<string, string> = {
      select: "*", experiment: "eq.football_price_gap_v1", cohort: `eq.${cohort}`,
      outcome_status: "eq.pending", kickoff_at: `gt.${new Date(now).toISOString()}`,
      order: "kickoff_at.asc,id.asc", limit: "1000", offset: String(offset),
    };
    if (league) params.league = `eq.${league}`;
    const page = await read(params);
    for (const entry of page) {
      if (entry.experiment === "football_price_gap_v1" && entry.cohort === cohort && (!league || entry.league === league)) entries.set(entry.id, entry);
    }
    if (page.length < 1000) break;
  }
  return [...entries.values()].sort((a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at) || a.id.localeCompare(b.id));
}

// Never substitute the market baseline for a learned model that has insufficient training data.
export function footballForecastProbability(entry: TrialEntry, variation: FootballHistoryVariation): number | null {
  const value = variation.model === "market" ? entry.market_probability : variation.model === "bucket" ? entry.bucket_probability : entry.rich_probability;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

// Expire recommendations at kickoff and reject malformed or non-prospective records defensively.
export function isUpcomingFootballForecast(entry: FootballForecast, now: number): boolean {
  const kickoff = Date.parse(entry.kickoff_at);
  const generated = Date.parse(entry.predicted_at);
  const snapshot = Date.parse(entry.snapshot_at);
  return entry.outcome_status === "pending" && now < kickoff && generated <= now && generated < kickoff
    && kickoff <= generated + 86400000 && snapshot <= generated && snapshot >= generated - 3600000
    && typeof entry.favourite_price === "number" && entry.favourite_price > 1 && Number.isFinite(entry.favourite_price)
    && typeof entry.price_gap === "number" && entry.price_gap >= 2
    && (entry.cohort === "plus_2" || (entry.cohort === "exact_2" && entry.price_gap < 2.5));
}
