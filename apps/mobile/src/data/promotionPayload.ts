export const SOURCE_TIME_ZONE = "Pacific/Auckland";

export type HistoricalBucket = {
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
  thirdPercentage: number;
  thirds: number;
  totalBonusBetCredit: number;
  totalReturn: number;
  totalStake: number;
  totalValueWithBonusCredit: number;
  winPercentage: number;
  wins: number;
};

export type RecommendationRace = {
  advertisedStart: string;
  code: string;
  favourite: {
    fixedWinPrice: number;
    impliedWinPercentage: number;
    name: string;
    number: number;
    priceBucket: string;
  } | null;
  historical: {
    historicalDelta: number | null;
    priceBucket: HistoricalBucket | null;
    starterBucket: HistoricalBucket | null;
  };
  marketMover: {
    name: string;
    number: number;
  } | null;
  raceCardId: string;
  raceName: string;
  raceNumber: number;
  signal: {
    detail: string;
    label: string;
    tone: "caution" | "muted" | "neutral" | "positive";
  };
  starters: number;
  status: string;
  targetRunner: {
    fixedWinPrice: number | null;
    name: string;
    number: number;
  } | null;
  track: string;
};

export type RecommendationPromotion = {
  coverage: "broad" | "race_specific";
  description: string;
  expiry: string;
  id: string;
  provider: string;
  races: RecommendationRace[];
  uri: string;
};

export type ActivePromotion = {
  description: string;
  expiry: string;
  id: string;
  provider: string;
  rootCategoryGroup: string | string[] | null;
  uri: string;
};

export type RecommendationSource = {
  allPromotions: ActivePromotion[];
  allPromotionCount: number;
  recommendations: RecommendationPromotion[];
  racingPromotionCount: number;
  source: string;
};

export type BetCandidate = RecommendationRace & {
  candidate: {
    blendedCashPlusBonusAverage: number | null;
    detail: string;
    label: string;
    sampleSize: number;
    tone: "caution" | "muted" | "neutral" | "positive";
  };
  canonicalTrack: string;
  predictionModels?: Record<string, BetCandidate["candidate"]>;
  rank: number;
  sourceTrack: string;
};

export type BetCandidateModelRun = {
  candidates: BetCandidate[];
  description: string;
  key: string;
  label: string;
};

export type RecommendationPayload = {
  betBackCandidates: {
    candidates: BetCandidate[];
    eligibleRaceCount: number;
    errors: { message: string; raceId: string }[];
    models?: BetCandidateModelRun[];
    note: string;
    provider: string;
    scannedMeetings: number;
    scannedRaceCount: number;
    source: string;
  } | null;
  generatedAt: string;
  generatedAtNz?: string;
  note: string;
  sourceDate: string;
  sourceTimeZone?: string;
  sources: RecommendationSource[];
  statsBasis: {
    basisLabel?: string;
    fixtureCount: number;
    priceBucketCount: number;
    starterBucketCount: number;
  };
  summary: {
    betBackCandidates: number;
    raceSpecificPromotions: number;
    racingPromotions: number;
    sources: number;
  };
};
