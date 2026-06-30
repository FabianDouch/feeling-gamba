import { publicEnv } from "../config/env";

const SOURCE_TIME_ZONE = "Pacific/Auckland";

type RaceCode = "horse" | "harness" | "greyhound";

type TrackRaceOddsRunnerPayload = {
  fixedWinPrice: number | null;
  id: string;
  impliedWinPercentage?: number;
  isFavourite: boolean;
  isMarketMover: boolean;
  name: string;
  number: number;
  priceBucket?: string;
};

type HistoricalBucketPayload = {
  averageReturnPerDollar: number;
  averageValuePerDollarWithBonusCredit: number;
  bonusBetCreditPercentage: number;
  favouriteSelections: number;
  label: string;
  winPercentage: number;
};

type TrackRaceOddsRacePayload = {
  advertisedStart: string;
  candidate: {
    blendedCashPlusBonusAverage: number | null;
    cashAverageScore: number | null;
    detail: string;
    label: string;
    predictionModelKey: string;
    predictionModelLabel: string;
    sampleSize: number;
    tone: "caution" | "muted" | "neutral" | "positive";
  } | null;
  favourite: TrackRaceOddsRunnerPayload | null;
  historical: {
    historicalDelta: number | null;
    priceBucket: HistoricalBucketPayload | null;
    starterBucket: HistoricalBucketPayload | null;
  };
  marketMover: TrackRaceOddsRunnerPayload | null;
  name: string;
  number: number;
  raceCardId: string;
  runners: TrackRaceOddsRunnerPayload[];
  signal: {
    detail: string;
    label: string;
    tone: "caution" | "muted" | "neutral" | "positive";
  };
  status: string;
  starterCount: number;
};

type TrackRaceOddsPayload = {
  country: string;
  courseSlug: string;
  fetchedAt: string;
  meeting: {
    name: string;
    venueName: string | null;
  } | null;
  raceCode: RaceCode;
  races: TrackRaceOddsRacePayload[];
  sourceDate: string;
  status: string;
};

export type TrackRaceOddsRunner = {
  flags: string;
  id: string;
  name: string;
  number: number;
  price: string;
};

export type TrackRaceOddsRace = {
  advertisedStart: string;
  candidateAverage: string;
  candidateCashAverageScore: string;
  candidateDetail: string;
  candidateLabel: string;
  candidateModelLabel: string;
  candidateSampleSize: string;
  candidateTone: "caution" | "muted" | "neutral" | "positive";
  favourite: string;
  favouriteImplied: string;
  favouritePriceBucket: string;
  historicalDelta: string;
  marketMover: string;
  name: string;
  number: number;
  priceBucketBonusHit: string;
  priceBucketLabel: string;
  raceCardId: string;
  runners: TrackRaceOddsRunner[];
  starterBucketAverage: string;
  starterBucketLabel: string;
  status: string;
  starterCount: number;
};

export type TrackRaceOddsResult = {
  fetchedAtLabel: string;
  meetingLabel: string;
  races: TrackRaceOddsRace[];
  sourceDate: string;
  status: string;
};

type RequestTrackRaceOddsParams = {
  country: string;
  courseSlug: string;
  raceCode: RaceCode;
};

export const hasTrackRaceOddsConfig = Boolean(
  publicEnv.trackOddsRequestUrl || publicEnv.supabaseUrl,
);

/**
 * Requests current public odds for every race at one selected track/code.
 */
export async function requestTrackRaceOdds(
  params: RequestTrackRaceOddsParams,
): Promise<TrackRaceOddsResult> {
  const url = getTrackOddsRequestUrl();

  if (!url) {
    throw new Error("Track odds request endpoint is not configured.");
  }

  const response = await fetch(url, {
    body: JSON.stringify({
      ...params,
      allRaces: true,
      sourceDate: getTodayInSourceTimeZone(),
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Track odds request failed with HTTP ${response.status}`);
  }

  const body = await response.json() as { payload: TrackRaceOddsPayload };

  return mapTrackRaceOddsPayload(body.payload);
}

function getTrackOddsRequestUrl() {
  if (publicEnv.trackOddsRequestUrl) {
    return publicEnv.trackOddsRequestUrl;
  }

  if (!publicEnv.supabaseUrl) {
    return null;
  }

  return `${publicEnv.supabaseUrl}/functions/v1/request-track-race-odds`;
}

function mapTrackRaceOddsPayload(payload: TrackRaceOddsPayload): TrackRaceOddsResult {
  return {
    fetchedAtLabel: formatDateTime(payload.fetchedAt),
    meetingLabel: payload.meeting?.venueName ?? payload.meeting?.name ?? "Meeting not found",
    races: payload.races.map((race) => ({
      advertisedStart: formatDateTime(race.advertisedStart),
      candidateAverage: formatCurrency(race.candidate?.blendedCashPlusBonusAverage ?? null),
      candidateCashAverageScore: formatCurrency(race.candidate?.cashAverageScore ?? null),
      candidateDetail: race.candidate?.detail ?? race.signal.detail,
      candidateLabel: race.candidate?.label ?? race.signal.label,
      candidateModelLabel: race.candidate?.predictionModelLabel ?? "Global bucket blend",
      candidateSampleSize: `${race.candidate?.sampleSize ?? 0} bucket selections`,
      candidateTone: race.candidate?.tone ?? race.signal.tone,
      favourite: race.favourite
        ? `#${race.favourite.number} ${race.favourite.name} ${formatPrice(race.favourite.fixedWinPrice)}`
        : "No favourite price",
      favouriteImplied: formatPercentage(race.favourite?.impliedWinPercentage ?? null),
      favouritePriceBucket: race.favourite?.priceBucket ?? "-",
      historicalDelta: formatSignedPercentage(race.historical.historicalDelta),
      marketMover: race.marketMover
        ? `#${race.marketMover.number} ${race.marketMover.name}`
        : "No MarketMover",
      name: race.name,
      number: race.number,
      priceBucketBonusHit: race.historical.priceBucket
        ? `${formatPercentage(race.historical.priceBucket.bonusBetCreditPercentage)} bonus hit`
        : "-",
      priceBucketLabel: race.historical.priceBucket?.label ?? "-",
      raceCardId: race.raceCardId,
      runners: race.runners.map((runner) => ({
        flags: [
          runner.isFavourite ? "Fav" : null,
          runner.isMarketMover ? "MM" : null,
        ].filter(Boolean).join(" · "),
        id: runner.id,
        name: runner.name,
        number: runner.number,
        price: formatPrice(runner.fixedWinPrice),
      })),
      starterBucketAverage: race.historical.starterBucket
        ? `${formatCurrency(race.historical.starterBucket.averageValuePerDollarWithBonusCredit)} avg`
        : "-",
      starterBucketLabel: race.historical.starterBucket
        ? `${race.historical.starterBucket.label} starters`
        : "-",
      status: race.status,
      starterCount: race.starterCount,
    })),
    sourceDate: payload.sourceDate,
    status: payload.status,
  };
}

/**
 * Reads today's Auckland source date for on-demand racing source requests.
 */
function getTodayInSourceTimeZone() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
  }).format(date);
}

function formatPrice(value: number | null) {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}

function formatCurrency(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `$${value.toFixed(2)}`;
}

function formatPercentage(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "-"
    : `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatSignedPercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(value % 1 === 0 ? 0 : 2)} pts`;
}
