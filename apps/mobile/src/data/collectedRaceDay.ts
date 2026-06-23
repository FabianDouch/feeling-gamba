import { localRaceFixtures } from "./fixtures/localRaceFixtures";

export type RaceCode = "horse" | "harness" | "greyhound";

type Price = {
  id: string;
  odds: {
    decimal: number | null;
  };
};

type RunnerRow = {
  id: string;
  isMarketMover: boolean;
  name: string;
  number: number;
  prices?: Price[];
  scratchedTimestamp: string | null;
};

type ResultRow = {
  id: string;
  position: number;
  winPlaceDividends?: {
    label: string;
    value: string;
  }[];
};

type RaceResult = {
  __typename: string;
  runnerRows?: ResultRow[];
};

type FavouriteSelection = {
  fixedWinPrice: number;
  id: string;
  isMarketMover: boolean;
  name: string;
  number: number;
  oneDollarBonusBetCredit?: number;
  oneDollarTotalValueWithBonusCredit?: number;
  oneDollarWinReturn?: number;
  resultPosition: number | null;
  winDividend: number | null;
};

type Winner = {
  id: string;
  name: string | null;
  number: number | null;
  winDividend: number | null;
};

type RaceCard = {
  advertisedStart: string;
  distance: number | null;
  finalField?: {
    runnerRows?: RunnerRow[];
  };
  id: string;
  name: string;
  number: number;
  results?: RaceResult[];
  status: string;
  trackCondition: string | null;
};

type FixtureRace = {
  derived: {
    activeStarterCount: number;
    favourites: FavouriteSelection[];
    fixedWinProductTypeId: string;
    marketMovers: FavouriteSelection[];
    scratchedCount: number;
    winners: Winner[];
  };
  raceCard: RaceCard;
  raceCardId: string;
};

type FavouriteBucket = {
  averageReturnPerDollar: number;
  averageValuePerDollarWithBonusCredit: number;
  bonusBetCreditPercentage: number;
  bonusBetCredits: number;
  favouriteSelections: number;
  label: string;
  profitLoss: number;
  profitLossWithBonusCredit: number;
  secondPercentage: number;
  seconds: number;
  totalBonusBetCredit: number;
  thirdPercentage: number;
  thirds: number;
  totalReturn: number;
  totalStake: number;
  totalValueWithBonusCredit: number;
  winPercentage: number;
  wins: number;
};

type Fixture = {
  filters?: {
    pilotTracks?: {
      canonicalName: string;
      country?: string;
    }[];
  };
  meetings: {
    canonicalTrack: string;
    source: {
      category: "HORSE" | "HARNESS" | "GREYHOUND";
      venue?: {
        country?: string | null;
      };
    };
    races: FixtureRace[];
  }[];
  summary: {
    favouriteOutcomes: {
      byDiscipline: FavouriteBucket[];
      byStarterCount: FavouriteBucket[];
      overall: FavouriteBucket;
    };
  };
  testDate: string;
};

export type RaceSummary = {
  code: RaceCode;
  country: string;
  dateLabel: string;
  dateValue: string;
  favourite: string;
  favouriteFinish: string;
  marketMover?: string;
  number: number;
  payout: string;
  raceId: string;
  raceName: string;
  result: string;
  starters: number;
  status: "Final" | "Missing market" | "Pending";
  track: string;
};

export type RaceRunnerDetail = {
  fixedWinPrice: string;
  isFavourite: boolean;
  isMarketMover: boolean;
  name: string;
  number: number;
  result: string;
  scratched: boolean;
  winDividend: string;
};

export type RaceDetail = {
  code: RaceCode;
  country: string;
  distance: string;
  favourite: string;
  favouriteFinish: string;
  marketMover: string;
  raceName: string;
  raceNumber: number;
  runners: RaceRunnerDetail[];
  sourceStatus: string;
  starters: number;
  track: string;
  winner: string;
  winnerDividend: string;
};

export type FavouriteStat = {
  detail: string;
  label: string;
  value: string;
};

export type DisciplineReturn = {
  averageReturn: string;
  bonusAverageReturn: string;
  bonusCredit: string;
  bonusHitRate: string;
  discipline: string;
  missingPrices: number;
  netReturn: string;
  promoAverageReturn: string;
  promoNetReturn: string;
  promoRoi: string;
  roi: string;
  totalPromoValue: string;
  totalReturned: string;
  totalStaked: string;
  winRate: string;
};

export type StarterBreakdown = {
  bonusAverageReturn: string;
  bonusCredit: string;
  bonusHitRate: string;
  cashAverageReturn: string;
  cashNetReturn: string;
  cashReturned: string;
  cashRoi: string;
  promoAverageReturn: string;
  promoNetReturn: string;
  promoRoi: string;
  selections: string;
  secondRate: string;
  starters: string;
  thirdRate: string;
  totalPromoValue: string;
  totalStaked: string;
  winRate: string;
};

export type PriceBreakdown = {
  averageReturn: string;
  label: string;
  netReturn: string;
  selections: string;
  totalReturned: string;
  totalStaked: string;
  winRate: string;
};

export type RaceFilterOption = {
  label: string;
  value: string;
};

export type InsightsData = {
  disciplineReturns: DisciplineReturn[];
  favouriteStats: FavouriteStat[];
  priceBreakdown: PriceBreakdown[];
  starterBreakdown: StarterBreakdown[];
};

export type InsightFilters = {
  country: string;
  track: string;
};

const fixtures = localRaceFixtures as unknown as Fixture[];
const activeFixtures = fixtures;
const disciplineFilterOptions: RaceFilterOption[] = [
  { label: "Horse", value: "horse" },
  { label: "Harness", value: "harness" },
  { label: "Greyhound", value: "greyhound" },
];

/**
 * Normalises source country codes so old AU fixture metadata and AUS meetings line up.
 */
function normalizeCountry(value: string | null | undefined) {
  if (value === "AU") {
    return "AUS";
  }

  return value ?? "Unknown";
}

/**
 * Converts the source fixture category into the app's lower-case race code.
 */
function toRaceCode(category: Fixture["meetings"][number]["source"]["category"]): RaceCode {
  const mapping = {
    GREYHOUND: "greyhound",
    HARNESS: "harness",
    HORSE: "horse",
  } satisfies Record<Fixture["meetings"][number]["source"]["category"], RaceCode>;

  return mapping[category];
}

/**
 * Formats fixture labels into display-friendly title case for UI tables.
 */
function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

/**
 * Formats signed money values, keeping the minus sign before the dollar symbol.
 */
function formatCurrency(value: number) {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Formats percentages with whole numbers when possible and two decimals otherwise.
 */
function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

/**
 * Formats a return amount as a positive dollar value for race and stats labels.
 */
function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

/**
 * Turns an ISO date string into the compact date label used in race rows.
 */
function formatDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

/**
 * Turns an ISO date string into the full date label used by filters and range text.
 */
function formatLongDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}

/**
 * Converts a finishing position into a readable ordinal, or "Missing" when unknown.
 */
function ordinal(value: number | null) {
  if (value === null) {
    return "Missing";
  }

  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  return `${value}${suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0]}`;
}

/**
 * Finds the settled result rows inside a race card's mixed result payload.
 */
function getResultRows(raceCard: RaceCard) {
  return raceCard.results?.find((result) => result.__typename === "RacingResults")
    ?.runnerRows ?? [];
}

/**
 * Reads the fixed-win decimal price for a runner from the configured source product.
 */
function getFixedWinPrice(runner: RunnerRow, fixedWinProductTypeId: string) {
  return runner.prices?.find((price) => price.id.includes(`:${fixedWinProductTypeId}:`))
    ?.odds.decimal ?? null;
}

/**
 * Extracts the official win dividend from a result row when the source provides it.
 */
function getWinDividend(resultRow: ResultRow | undefined) {
  const dividend = resultRow?.winPlaceDividends?.find((entry) => entry.label === "Win");
  return dividend ? Number(dividend.value) : null;
}

/**
 * Summarises the favourite's finish in plain language for the race list.
 */
function describeFavouriteResult(favourite: FavouriteSelection | undefined) {
  if (!favourite || favourite.resultPosition === null) {
    return "Favourite result missing";
  }

  if (favourite.resultPosition === 1) {
    return "Favourite won";
  }

  if (favourite.resultPosition <= 3) {
    return `Favourite ${ordinal(favourite.resultPosition)}`;
  }

  return "Favourite unplaced";
}

/**
 * Converts one fixture race into the compact row model used by the Race Days list.
 */
function mapRaceSummary(meeting: Fixture["meetings"][number], race: FixtureRace): RaceSummary {
  const favourite = race.derived.favourites[0];
  const marketMover = race.derived.marketMovers[0];
  const favouriteReturn = favourite?.oneDollarWinReturn ?? 0;
  const favouriteBonusCredit = getBonusBetCredit(
    favourite?.resultPosition ?? null,
    race.derived.activeStarterCount,
  );
  const dateValue = race.raceCard.advertisedStart.slice(0, 10);

  return {
    code: toRaceCode(meeting.source.category),
    country: normalizeCountry(meeting.source.venue?.country),
    dateLabel: formatDateLabel(dateValue),
    dateValue,
    favourite: favourite?.name ?? "Missing favourite",
    favouriteFinish: ordinal(favourite?.resultPosition ?? null),
    marketMover: marketMover?.name,
    number: race.raceCard.number,
    payout: favouriteBonusCredit > 0
      ? `Fav ${formatReturn(favouriteReturn)} + ${formatReturn(favouriteBonusCredit)} bonus`
      : `Fav return ${formatReturn(favouriteReturn)}`,
    raceId: race.raceCardId,
    raceName: race.raceCard.name,
    result: describeFavouriteResult(favourite),
    starters: race.derived.activeStarterCount,
    status: race.raceCard.status === "FINAL" ? "Final" : "Pending",
    track: meeting.canonicalTrack,
  };
}

/**
 * Converts one fixture race into the detail model, including runner-level prices and results.
 */
function mapRaceDetail(meeting: Fixture["meetings"][number], race: FixtureRace): RaceDetail {
  const favourite = race.derived.favourites[0];
  const favouriteIds = new Set(race.derived.favourites.map((entry) => entry.id));
  const marketMover = race.derived.marketMovers[0];
  const winner = race.derived.winners[0];
  const resultRows = getResultRows(race.raceCard);
  const resultByRunnerId = new Map(resultRows.map((row) => [row.id, row]));

  const runners = [...(race.raceCard.finalField?.runnerRows ?? [])]
    .sort((left, right) => left.number - right.number)
    .map((runner) => {
      const resultRow = resultByRunnerId.get(runner.id);
      const fixedWinPrice = getFixedWinPrice(runner, race.derived.fixedWinProductTypeId);
      const winDividend = getWinDividend(resultRow);

      return {
        fixedWinPrice: fixedWinPrice === null ? "-" : formatReturn(fixedWinPrice),
        isFavourite: favouriteIds.has(runner.id),
        isMarketMover: runner.isMarketMover,
        name: runner.name,
        number: runner.number,
        result: runner.scratchedTimestamp ? "Scr" : ordinal(resultRow?.position ?? null),
        scratched: Boolean(runner.scratchedTimestamp),
        winDividend: winDividend === null ? "-" : formatReturn(winDividend),
      };
    });

  return {
    code: toRaceCode(meeting.source.category),
    country: normalizeCountry(meeting.source.venue?.country),
    distance: race.raceCard.distance ? `${race.raceCard.distance}m` : "Distance missing",
    favourite: favourite?.name ?? "Missing favourite",
    favouriteFinish: ordinal(favourite?.resultPosition ?? null),
    marketMover: marketMover?.name ?? "No MarketMover flag",
    raceName: race.raceCard.name,
    raceNumber: race.raceCard.number,
    runners,
    sourceStatus: "Loaded from local Betcha GraphQL JSON fixture.",
    starters: race.derived.activeStarterCount,
    track: meeting.canonicalTrack,
    winner: winner?.name ?? "Winner missing",
    winnerDividend: winner?.winDividend === null || winner?.winDividend === undefined
      ? "Dividend missing"
      : formatReturn(winner.winDividend),
  };
}

/**
 * Converts a discipline aggregate bucket into the return metrics shown in Insights.
 */
function mapDisciplineReturn(bucket: FavouriteBucket): DisciplineReturn {
  const bonusAverageReturn = bucket.totalStake === 0
    ? 0
    : bucket.totalBonusBetCredit / bucket.totalStake;
  const roi = bucket.totalStake === 0
    ? 0
    : (bucket.profitLoss / bucket.totalStake) * 100;
  const promoRoi = bucket.totalStake === 0
    ? 0
    : (bucket.profitLossWithBonusCredit / bucket.totalStake) * 100;

  return {
    averageReturn: formatReturn(bucket.averageReturnPerDollar),
    bonusAverageReturn: formatReturn(bonusAverageReturn),
    bonusCredit: formatCurrency(bucket.totalBonusBetCredit),
    bonusHitRate: formatPercentage(bucket.bonusBetCreditPercentage),
    discipline: toTitleCase(bucket.label),
    missingPrices: 0,
    netReturn: formatCurrency(bucket.profitLoss),
    promoAverageReturn: formatReturn(bucket.averageValuePerDollarWithBonusCredit),
    promoNetReturn: formatCurrency(bucket.profitLossWithBonusCredit),
    promoRoi: formatPercentage(promoRoi),
    roi: formatPercentage(roi),
    totalPromoValue: formatCurrency(bucket.totalValueWithBonusCredit),
    totalReturned: formatCurrency(bucket.totalReturn),
    totalStaked: formatCurrency(bucket.totalStake),
    winRate: formatPercentage(bucket.winPercentage),
  };
}

/**
 * Creates a zeroed favourite-performance bucket so multiple fixtures can be merged safely.
 */
function createEmptyBucket(label: string): FavouriteBucket {
  return {
    averageReturnPerDollar: 0,
    averageValuePerDollarWithBonusCredit: 0,
    bonusBetCreditPercentage: 0,
    bonusBetCredits: 0,
    favouriteSelections: 0,
    label,
    profitLoss: 0,
    profitLossWithBonusCredit: 0,
    secondPercentage: 0,
    seconds: 0,
    thirdPercentage: 0,
    thirds: 0,
    totalBonusBetCredit: 0,
    totalReturn: 0,
    totalStake: 0,
    totalValueWithBonusCredit: 0,
    winPercentage: 0,
    wins: 0,
  };
}

/**
 * Recalculates percentages, averages, and profit figures after bucket totals are merged.
 */
function finalizeBucket(bucket: FavouriteBucket): FavouriteBucket {
  const favouriteSelections = bucket.favouriteSelections;
  const totalStake = bucket.totalStake;

  return {
    ...bucket,
    averageReturnPerDollar: totalStake
      ? Number((bucket.totalReturn / totalStake).toFixed(3))
      : 0,
    averageValuePerDollarWithBonusCredit: totalStake
      ? Number((bucket.totalValueWithBonusCredit / totalStake).toFixed(3))
      : 0,
    bonusBetCreditPercentage: favouriteSelections
      ? Number(((bucket.bonusBetCredits / favouriteSelections) * 100).toFixed(2))
      : 0,
    profitLoss: Number((bucket.totalReturn - totalStake).toFixed(2)),
    profitLossWithBonusCredit: Number(
      (bucket.totalValueWithBonusCredit - totalStake).toFixed(2),
    ),
    secondPercentage: favouriteSelections
      ? Number(((bucket.seconds / favouriteSelections) * 100).toFixed(2))
      : 0,
    thirdPercentage: favouriteSelections
      ? Number(((bucket.thirds / favouriteSelections) * 100).toFixed(2))
      : 0,
    totalBonusBetCredit: Number(bucket.totalBonusBetCredit.toFixed(2)),
    totalReturn: Number(bucket.totalReturn.toFixed(2)),
    totalStake: Number(totalStake.toFixed(2)),
    totalValueWithBonusCredit: Number(bucket.totalValueWithBonusCredit.toFixed(2)),
    winPercentage: favouriteSelections
      ? Number(((bucket.wins / favouriteSelections) * 100).toFixed(2))
      : 0,
  };
}

/**
 * Builds the human-readable label for a 50c favourite-price bucket.
 */
function createPriceBucketLabel(start: number) {
  return `$${start.toFixed(2)} - $${(start + 0.49).toFixed(2)}`;
}

/**
 * Finds the lower bound of the 50c price bucket for a fixed-win favourite price.
 */
function getPriceBucketStart(price: number) {
  return 1 + Math.floor(Math.max(0, price - 1) / 0.5) * 0.5;
}

/**
 * Applies AU/NZ place-style bet-back terms from the final starter count.
 */
function getBonusBetCredit(resultPosition: number | null, starterCount: number) {
  if (resultPosition === 2 && starterCount >= 5) {
    return 1;
  }

  if (resultPosition === 3 && starterCount >= 8) {
    return 1;
  }

  return 0;
}

/**
 * Adds one settled favourite selection into an aggregate bucket.
 */
function addFavouriteSelectionToBucket(
  bucket: FavouriteBucket,
  favourite: FavouriteSelection,
  starterCount: number,
) {
  const winReturn = favourite.resultPosition === 1 ? favourite.fixedWinPrice : 0;
  const bonusCredit = getBonusBetCredit(favourite.resultPosition, starterCount);

  bucket.favouriteSelections += 1;
  bucket.totalStake += 1;
  bucket.totalReturn += winReturn;
  bucket.totalBonusBetCredit += bonusCredit;
  bucket.totalValueWithBonusCredit += winReturn + bonusCredit;
  bucket.bonusBetCredits += bonusCredit > 0 ? 1 : 0;

  if (favourite.resultPosition === 1) {
    bucket.wins += 1;
  } else if (favourite.resultPosition === 2) {
    bucket.seconds += 1;
  } else if (favourite.resultPosition === 3) {
    bucket.thirds += 1;
  }
}

/**
 * Sorts aggregate buckets by numeric labels when possible, then by display text.
 */
function sortBuckets(buckets: FavouriteBucket[]) {
  return buckets.sort((left, right) => {
    const numericLeft = Number(left.label);
    const numericRight = Number(right.label);

    if (Number.isFinite(numericLeft) && Number.isFinite(numericRight)) {
      return numericLeft - numericRight;
    }

    return left.label.localeCompare(right.label);
  });
}

/**
 * Sorts 50c price buckets by their numeric lower bound.
 */
function sortPriceBuckets(buckets: FavouriteBucket[]) {
  return buckets.sort((left, right) =>
    Number(left.label.slice(1, 5)) - Number(right.label.slice(1, 5)));
}

/**
 * Builds raw insight buckets for all tracks or one selected track from race-level fixture data.
 */
function aggregateInsightBuckets({ country, track }: InsightFilters) {
  const overall = createEmptyBucket("overall");
  const byDiscipline = new Map<string, FavouriteBucket>();
  const byStarterCount = new Map<string, FavouriteBucket>();
  const byPrice = new Map<string, FavouriteBucket>();

  for (const fixture of activeFixtures) {
    for (const meeting of fixture.meetings) {
      const meetingCountry = normalizeCountry(meeting.source.venue?.country);

      if (country !== "all" && meetingCountry !== country) {
        continue;
      }

      if (track !== "all" && meeting.canonicalTrack !== track) {
        continue;
      }

      const raceCode = toRaceCode(meeting.source.category);

      for (const race of meeting.races) {
        for (const favourite of race.derived.favourites) {
          if (favourite.resultPosition === null || !Number.isFinite(favourite.fixedWinPrice)) {
            continue;
          }

          const disciplineBucket = byDiscipline.get(raceCode) ?? createEmptyBucket(raceCode);
          const starterLabel = String(race.derived.activeStarterCount);
          const starterBucket = byStarterCount.get(starterLabel) ?? createEmptyBucket(starterLabel);
          const priceStart = getPriceBucketStart(favourite.fixedWinPrice);
          const priceLabel = createPriceBucketLabel(priceStart);
          const priceBucket = byPrice.get(priceLabel) ?? createEmptyBucket(priceLabel);

          addFavouriteSelectionToBucket(overall, favourite, race.derived.activeStarterCount);
          addFavouriteSelectionToBucket(
            disciplineBucket,
            favourite,
            race.derived.activeStarterCount,
          );
          addFavouriteSelectionToBucket(starterBucket, favourite, race.derived.activeStarterCount);
          addFavouriteSelectionToBucket(priceBucket, favourite, race.derived.activeStarterCount);

          byDiscipline.set(raceCode, disciplineBucket);
          byStarterCount.set(starterLabel, starterBucket);
          byPrice.set(priceLabel, priceBucket);
        }
      }
    }
  }

  return {
    byDiscipline: sortBuckets(Array.from(byDiscipline.values()).map(finalizeBucket)),
    byPrice: sortPriceBuckets(Array.from(byPrice.values()).map(finalizeBucket)),
    byStarterCount: sortBuckets(Array.from(byStarterCount.values()).map(finalizeBucket)),
    overall: finalizeBucket(overall),
  };
}

/**
 * Converts an aggregate starter-count bucket into the row model used by Insights.
 */
function mapStarterBreakdown(bucket: FavouriteBucket): StarterBreakdown {
  const bonusAverageReturn = bucket.totalStake === 0
    ? 0
    : bucket.totalBonusBetCredit / bucket.totalStake;
  const cashRoi = bucket.totalStake === 0
    ? 0
    : (bucket.profitLoss / bucket.totalStake) * 100;
  const promoRoi = bucket.totalStake === 0
    ? 0
    : (bucket.profitLossWithBonusCredit / bucket.totalStake) * 100;

  return {
    bonusAverageReturn: formatReturn(bonusAverageReturn),
    bonusCredit: formatCurrency(bucket.totalBonusBetCredit),
    bonusHitRate: formatPercentage(bucket.bonusBetCreditPercentage),
    cashAverageReturn: formatReturn(bucket.averageReturnPerDollar),
    cashNetReturn: formatCurrency(bucket.profitLoss),
    cashReturned: formatCurrency(bucket.totalReturn),
    cashRoi: formatPercentage(cashRoi),
    promoAverageReturn: formatReturn(bucket.averageValuePerDollarWithBonusCredit),
    promoNetReturn: formatCurrency(bucket.profitLossWithBonusCredit),
    promoRoi: formatPercentage(promoRoi),
    selections: `${bucket.favouriteSelections} selections`,
    secondRate: formatPercentage(bucket.secondPercentage),
    starters: `${bucket.label} starters`,
    thirdRate: formatPercentage(bucket.thirdPercentage),
    totalPromoValue: formatCurrency(bucket.totalValueWithBonusCredit),
    totalStaked: formatCurrency(bucket.totalStake),
    winRate: formatPercentage(bucket.winPercentage),
  };
}

/**
 * Converts an aggregate price bucket into the row model used by Insights.
 */
function mapPriceBreakdown(bucket: FavouriteBucket): PriceBreakdown {
  return {
    averageReturn: formatReturn(bucket.averageReturnPerDollar),
    label: bucket.label,
    netReturn: formatCurrency(bucket.profitLoss),
    selections: `${bucket.favouriteSelections} selections`,
    totalReturned: formatCurrency(bucket.totalReturn),
    totalStaked: formatCurrency(bucket.totalStake),
    winRate: formatPercentage(bucket.winPercentage),
  };
}

/**
 * Converts the overall aggregate bucket into the top KPI cards used by Insights.
 */
function mapFavouriteStats(overall: FavouriteBucket): FavouriteStat[] {
  return [
    {
      detail: `${overall.favouriteSelections} selections`,
      label: "Favourite wins",
      value: formatPercentage(overall.winPercentage),
    },
    {
      detail: `${overall.seconds} finished 2nd`,
      label: "Favourite 2nd",
      value: formatPercentage(overall.secondPercentage),
    },
    {
      detail: `${overall.thirds} finished 3rd`,
      label: "Favourite 3rd",
      value: formatPercentage(overall.thirdPercentage),
    },
    {
      detail: `${overall.bonusBetCredits} credits earned`,
      label: "Bonus bet credits",
      value: formatCurrency(overall.totalBonusBetCredit),
    },
  ];
}

/**
 * Builds all Insight tables for the selected track value.
 */
export function getInsightsForTrack(trackValue: string, countryValue = "all"): InsightsData {
  const buckets = aggregateInsightBuckets({
    country: countryValue,
    track: trackValue,
  });

  return {
    disciplineReturns: buckets.byDiscipline.map(mapDisciplineReturn),
    favouriteStats: mapFavouriteStats(buckets.overall),
    priceBreakdown: buckets.byPrice.map(mapPriceBreakdown),
    starterBreakdown: buckets.byStarterCount.map(mapStarterBreakdown),
  };
}

/**
 * Picks the first available race detail so the detail screen has a stable initial record.
 */
function findFirstRaceDetail() {
  const fixture = activeFixtures.find((candidate) => candidate.meetings.some((meeting) => meeting.races.length));
  const meeting = fixture?.meetings.find((candidate) => candidate.races.length);
  const race = meeting?.races[0];

  if (!meeting || !race) {
    throw new Error("No local fixture races found.");
  }

  return mapRaceDetail(meeting, race);
}

const mappedRaceSummaries: RaceSummary[] = activeFixtures.flatMap((fixture) =>
  fixture.meetings.flatMap((meeting) =>
    meeting.races.map((race) => mapRaceSummary(meeting, race)),
  ),
);

export const raceSummaries: RaceSummary[] = Array.from(
  new Map(mappedRaceSummaries.map((race) => [race.raceId, race])).values(),
).sort((left, right) =>
  left.dateValue.localeCompare(right.dateValue)
  || left.track.localeCompare(right.track)
  || left.number - right.number
  || left.raceId.localeCompare(right.raceId));

export const raceDateOptions: RaceFilterOption[] = Array.from(
  new Map(raceSummaries.map((race) => [race.dateValue, {
    label: formatLongDateLabel(race.dateValue),
    value: race.dateValue,
  }])).values(),
).sort((left, right) => left.value.localeCompare(right.value));

const firstRaceDate = raceDateOptions[0]?.value ?? "No dates";
const lastRaceDate = raceDateOptions.at(-1)?.value ?? firstRaceDate;

export const defaultRaceDateRange = {
  from: firstRaceDate,
  to: lastRaceDate,
};

export const raceDayLabel = `${formatLongDateLabel(firstRaceDate)} - ${formatLongDateLabel(lastRaceDate)}`;
export const raceWindowLabel = `Collected dates from ${formatLongDateLabel(firstRaceDate)}`;

export const raceDisciplineOptions: RaceFilterOption[] = disciplineFilterOptions
  .filter((option) => raceSummaries.some((race) => race.code === option.value));

export const countryFilterOptions: RaceFilterOption[] = Array.from(
  new Set([
    ...raceSummaries.map((race) => race.country),
    ...activeFixtures.flatMap((fixture) =>
      fixture.filters?.pilotTracks?.map((track) => normalizeCountry(track.country)) ?? [],
    ),
  ]),
)
  .filter((country) => country !== "Unknown")
  .sort((left, right) => left.localeCompare(right))
  .map((country) => ({
    label: country,
    value: country,
  }));

export const raceCourseOptions: RaceFilterOption[] = Array.from(
  new Set([
    ...raceSummaries.map((race) => race.track),
    ...activeFixtures.flatMap((fixture) =>
      fixture.filters?.pilotTracks?.map((track) => track.canonicalName) ?? [],
    ),
  ]),
)
  .sort((left, right) => left.localeCompare(right))
  .map((track) => ({
    label: track,
    value: track,
  }));

export const selectedRaceDetail: RaceDetail = findFirstRaceDetail();

/**
 * Builds the Race Days course options for the selected country scope.
 */
export function getRaceCourseOptions(countryValue: string): RaceFilterOption[] {
  const trackCountries = new Map<string, string>();

  for (const race of raceSummaries) {
    trackCountries.set(race.track, race.country);
  }

  for (const fixture of activeFixtures) {
    for (const track of fixture.filters?.pilotTracks ?? []) {
      trackCountries.set(track.canonicalName, normalizeCountry(track.country));
    }
  }

  return Array.from(trackCountries)
    .filter(([, country]) => countryValue === "all" || country === countryValue)
    .map(([track]) => track)
    .sort((left, right) => left.localeCompare(right))
    .map((track) => ({
      label: track,
      value: track,
    }));
}

/**
 * Builds the Insights track options for the selected country scope.
 */
export function getInsightTrackOptions(countryValue: string): RaceFilterOption[] {
  return [
    { label: "All tracks", value: "all" },
    ...getRaceCourseOptions(countryValue),
  ];
}
