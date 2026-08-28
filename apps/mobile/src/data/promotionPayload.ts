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
  placeEligibleSelections?: number;
  placeHits?: number;
  placeAverageReturnPerDollar?: number;
  placeNetReturn?: number;
  placePercentage?: number;
  placeRoiPercentage?: number;
  secondPercentage: number;
  seconds: number;
  thirdPercentage: number;
  thirds: number;
  totalBonusBetCredit: number;
  totalPlaceReturn?: number;
  totalPlaceStake?: number;
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
    otherStartersAveragePriceBucket: HistoricalBucket | null;
    priceBucket: HistoricalBucket | null;
    starterBucket: HistoricalBucket | null;
  };
  fieldPriceShape?: {
    otherStartersAverageFixedWinPrice: number | null;
    otherStartersAveragePriceBucket: string | null;
    otherStartersPriceCount: number;
    otherStartersPriceOutlierCount: number;
    outlierCutoff: number;
  };
  marketMover: {
    name: string;
    number: number;
  } | null;
  raceCardId: string;
  raceName: string;
  raceNumber: number;
  placePayoutDepth?: number;
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
    cashAverageScore?: number | null;
    detail: string;
    label: string;
    sampleSize: number;
    tone: "caution" | "muted" | "neutral" | "positive";
  };
  canonicalTrack: string;
  country: string | null;
  placingCandidate?: {
    cashAverageScore?: number | null;
    detail: string;
    label: string;
    placePayoutDepth: number;
    placeScore: number | null;
    priceBucketCashAverage?: number | null;
    priceBucketLabel?: string | null;
    sampleSize: number;
    starterBucketCashAverage?: number | null;
    starterBucketLabel?: string | null;
    tone: "caution" | "muted" | "neutral" | "positive";
  };
  predictionModels?: Record<string, BetCandidate["candidate"]>;
  rank: number;
  sourceTrack: string;
  winPercentageMultiCandidate?: {
    cashAverageScore?: number | null;
    detail: string;
    label: string;
    priceBucketLabel?: string | null;
    priceBucketWinPercentage?: number | null;
    sampleSize: number;
    starterBucketLabel?: string | null;
    starterBucketWinPercentage?: number | null;
    tone: "caution" | "muted" | "neutral" | "positive";
    winScore: number | null;
  };
};

export type BetCandidateModelRun = {
  candidates: BetCandidate[];
  description: string;
  key: string;
  label: string;
};

export type UfcMultiSignal = {
  bucketLabel: string | null;
  bucketSampleSize: number;
  bucketWinPercentage: number | null;
  detail: string;
  label: string;
  score: number | null;
  tone: "caution" | "muted" | "neutral" | "positive";
};

export type UfcMultiLeg = {
  advertisedStart: string;
  fightName: string;
  otherEntrantId: string;
  otherFighterName: string;
  otherFixedWinPrice: number;
  predictedEntrantId: string;
  predictedFighterName: string;
  predictedFixedWinPrice: number;
  priceDifference: number;
  predictionRank: number;
  signal: UfcMultiSignal;
  sourceEventId: string;
  sourceMarketId: string;
};

export type UfcSinglePredictionCandidate = UfcMultiLeg & {
  sourceCardId: string;
  sourceCardName: string;
  sourceCardSlug: string | null;
};

export type UfcMultiRecommendation = {
  averageWinScore: number | null;
  combinedFixedWinPrice: number | null;
  firstFightStart: string | null;
  legs: UfcMultiLeg[];
  lockCutoffAt: string | null;
  raw: Record<string, unknown>;
  recommendationType: "neutral" | "positive";
  sourceCardId: string;
  sourceCardName: string;
  sourceCardSlug: string | null;
};

export type UfcWinPercentageMultiModelRun = {
  description: string;
  key: string;
  label: string;
  recommendations: UfcMultiRecommendation[];
  singleCandidates?: UfcSinglePredictionCandidate[];
};

export type UfcWinPercentageMultis = {
  errors?: { competitionSlug: string; message: string }[];
  finalisesAt?: string | null;
  finalisesAtNz?: string | null;
  firstFightStart?: string | null;
  matchedPflFightCount?: number;
  modelCount?: number;
  models: UfcWinPercentageMultiModelRun[];
  note?: string;
  provider: string;
  reviewedPflEventCount?: number;
  scannedCompetitionCount?: number;
  scannedPflCardCount?: number;
  scannedUfcCardCount?: number;
  source: string;
};

export type RecommendationPayload = {
  betBackCandidates: {
    candidates: BetCandidate[];
    eligibleRaceCount: number;
    errors: { message: string; raceId: string }[];
    models?: BetCandidateModelRun[];
    note: string;
    firstEligibleRaceStart?: string | null;
    placingCandidates?: BetCandidate[];
    provider: string;
    scannedMeetings: number;
    scannedRaceCount: number;
    source: string;
    winPercentageMultiCandidates?: BetCandidate[];
  } | null;
  generatedAt: string;
  generatedAtNz?: string;
  note: string;
  predictionWindow?: {
    finalisesAt?: string | null;
    finalisesAtNz?: string | null;
    firstRaceStart: string | null;
    firstRaceStartNz: string | null;
    generatedBeforeFinalisation?: boolean;
    generatedBeforeFirstRace: boolean;
    isClosed: boolean;
    skippedReason: string | null;
    status: "closed" | "open";
  };
  sourceDate: string;
  sourceTimeZone?: string;
  sources: RecommendationSource[];
  statsBasis: {
    basisLabel?: string;
    fixtureCount: number;
    otherStartersAveragePriceBucketCount?: number;
    pflBasisLabel?: string | null;
    pflFavouritePriceBucketCount?: number;
    pflOtherFighterPriceBucketCount?: number;
    pflPriceDifferenceBucketCount?: number;
    priceBucketCount: number;
    starterBucketCount: number;
    ufcBasisLabel?: string | null;
    ufcFavouritePriceBucketCount?: number;
    ufcOtherFighterPriceBucketCount?: number;
    ufcPriceDifferenceBucketCount?: number;
  };
  summary: {
    betBackCandidates: number;
    predictionWindowStatus?: string;
    raceSpecificPromotions: number;
    racingPromotions: number;
    sources: number;
    pflRecommendations?: number;
    ufcRecommendations?: number;
  };
  pflGeneratedAt?: string | null;
  pflGeneratedAtNz?: string | null;
  pflWinPercentageMultis?: UfcWinPercentageMultis | null;
  ufcGeneratedAt?: string | null;
  ufcGeneratedAtNz?: string | null;
  ufcWinPercentageMultis?: UfcWinPercentageMultis | null;
};
