import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../data/authSession";
import {
  DEFAULT_PREDICTION_MODEL_KEY,
  type PredictionModelKey,
} from "../data/supabasePredictions";
import {
  type BetCandidate,
  type RecommendationPayload,
  type RecommendationRace,
  SOURCE_TIME_ZONE,
} from "../data/promotionPayload";
import {
  fetchLatestPredictionSnapshot,
  hasPredictionRefreshEndpoint,
  hasSupabasePredictionCacheConfig,
  requestPredictionRefresh,
} from "../data/supabasePromotions";
import {
  fetchUserRaceBets,
  formatBookmaker,
  isUserRaceBetLogged,
  saveUserRaceBet,
  type UserRaceBet,
  type UserRaceBetInput,
} from "../data/userRaceBets";

const PROMOTION_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

type BetCandidateStatus = "empty" | "error" | "loading" | "supabase" | "unconfigured";

type BetCandidatesSectionProps = {
  predictionModelKey?: PredictionModelKey;
};

/**
 * Shows current source-backed candidate races beside the stored prediction outcomes.
 */
export function BetCandidatesSection({
  predictionModelKey = DEFAULT_PREDICTION_MODEL_KEY,
}: BetCandidatesSectionProps) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<RecommendationPayload | null>(null);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<BetCandidateStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRequestingRefresh, setIsRequestingRefresh] = useState(false);
  const [trackedBets, setTrackedBets] = useState<UserRaceBet[]>([]);
  const [trackedBetMessage, setTrackedBetMessage] = useState<string | null>(null);
  const [trackedBetError, setTrackedBetError] = useState<string | null>(null);
  const [selectedDisciplineCode, setSelectedDisciplineCode] = useState<string | null>(null);
  const betCandidateScan = payload?.betBackCandidates ?? null;
  const selectedModelRun = betCandidateScan?.models?.find((model) => model.key === predictionModelKey) ?? null;
  const selectedModelKey = selectedModelRun?.key ?? DEFAULT_PREDICTION_MODEL_KEY;
  const betCandidates = selectedModelRun?.candidates ?? betCandidateScan?.candidates ?? [];
  const candidatesByDiscipline = groupBetCandidatesByDiscipline(betCandidates, selectedModelKey);
  const activeCandidateGroup = candidatesByDiscipline.find((group) => group.code === selectedDisciplineCode)
    ?? candidatesByDiscipline[0]
    ?? null;
  const modelScoreLabel = "Cash avg score";
  const cacheAgeMs = snapshotGeneratedAt ? Date.now() - new Date(snapshotGeneratedAt).valueOf() : null;
  const predictionWindowClosedNow = isPredictionWindowClosedNow(payload?.predictionWindow);
  const candidatesAreStale = Boolean(payload)
    && !predictionWindowClosedNow
    && isSnapshotStale(snapshotGeneratedAt);
  const statusLabel = status === "supabase"
    ? "Loaded from Supabase cache"
    : status === "loading"
      ? isRequestingRefresh ? "Refreshing candidates" : "Checking Supabase cache"
      : status === "unconfigured"
        ? "Supabase candidate cache is not configured"
        : status === "empty"
          ? "No Supabase candidate snapshot available"
          : "Supabase candidate cache unavailable";

  useEffect(() => {
    let isActive = true;

    async function loadCandidates() {
      if (!hasSupabasePredictionCacheConfig) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("unconfigured");
        setLoadError("Supabase is not configured for bet candidates.");
        return;
      }

      setStatus("loading");
      setLoadError(null);

      try {
        let latestSnapshot = await fetchLatestPredictionSnapshot<RecommendationPayload>();

        if (!isActive) {
          return;
        }

        if (latestSnapshot?.sourceTable === "current_promotion_snapshots") {
          setRefreshMessage("Prediction cache table is not deployed yet. Showing latest promotion snapshot temporarily.");
        }

        if (!latestSnapshot && hasPredictionRefreshEndpoint) {
          setIsRequestingRefresh(true);
          setRefreshMessage("Requesting today's pre-race bet candidates.");
          const refreshedPayload = await requestPredictionRefresh<RecommendationPayload>();
          latestSnapshot = refreshedPayload
            ? createSnapshotFromPayload(refreshedPayload)
            : await fetchLatestPredictionSnapshot<RecommendationPayload>();
        }

        if (
          latestSnapshot?.sourceTable !== "current_promotion_snapshots"
          && latestSnapshot
          && isSnapshotStale(latestSnapshot.generatedAt)
          && hasPredictionRefreshEndpoint
        ) {
          setIsRequestingRefresh(true);
          setRefreshMessage("Refreshing stale bet candidates.");
          const refreshedPayload = await requestPredictionRefresh<RecommendationPayload>();
          latestSnapshot = refreshedPayload
            ? createSnapshotFromPayload(refreshedPayload)
            : await fetchLatestPredictionSnapshot<RecommendationPayload>();
        }

        if (!isActive) {
          return;
        }

        if (!latestSnapshot) {
          setPayload(null);
          setSnapshotGeneratedAt(null);
          setStatus("empty");
          return;
        }

        setPayload(latestSnapshot.payload);
        setSnapshotGeneratedAt(latestSnapshot.generatedAt);
        setStatus("supabase");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPayload(null);
        setStatus("error");
        setLoadError(error instanceof Error ? error.message : "Bet candidates failed to load.");
      } finally {
        if (isActive) {
          setIsRequestingRefresh(false);
        }
      }
    }

    loadCandidates();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadTrackedBets() {
      if (!user) {
        setTrackedBets([]);
        return;
      }

      try {
        const nextTrackedBets = await fetchUserRaceBets();

        if (isActive) {
          setTrackedBets(nextTrackedBets);
        }
      } catch (error) {
        if (isActive) {
          setTrackedBetError(error instanceof Error ? error.message : "Tracked bets failed to load.");
        }
      }
    }

    loadTrackedBets();

    return () => {
      isActive = false;
    };
  }, [user]);

  async function refreshCandidates() {
    if (!hasSupabasePredictionCacheConfig) {
      setRefreshMessage("Supabase is not configured for bet candidates.");
      return;
    }

    try {
      setIsRequestingRefresh(true);
      setRefreshMessage("Requesting fresh bet candidates.");
      setLoadError(null);
      let refreshError: Error | null = null;
      let refreshedPayload: RecommendationPayload | null = null;

      if (hasPredictionRefreshEndpoint) {
        try {
          refreshedPayload = await requestPredictionRefresh<RecommendationPayload>();
        } catch (error) {
          refreshError = error instanceof Error ? error : new Error("Prediction refresh failed.");
        }
      }

      if (refreshError && isPredictionWindowClosedError(refreshError)) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("empty");
        setRefreshMessage(refreshError.message);
        return;
      }

      const latestSnapshot = refreshedPayload
        ? createSnapshotFromPayload(refreshedPayload)
        : await fetchLatestPredictionSnapshot<RecommendationPayload>();

      if (!latestSnapshot) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("empty");
        setRefreshMessage("No Supabase candidate snapshot is available yet.");
        return;
      }

      setPayload(latestSnapshot.payload);
      setSnapshotGeneratedAt(latestSnapshot.generatedAt);
      setStatus("supabase");
      setRefreshMessage(latestSnapshot.sourceTable === "current_promotion_snapshots"
        ? "Prediction cache table is not deployed yet. Showing latest promotion snapshot temporarily."
        : refreshError
          ? `Prediction refresh failed, but cached candidates loaded: ${refreshError.message}`
          : hasPredictionRefreshEndpoint
            ? "Fresh bet candidates loaded."
            : "Supabase cache rechecked. Configure EXPO_PUBLIC_PREDICTION_REFRESH_URL to generate new candidates from the app.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not refresh bet candidates.");
      setStatus("error");
    } finally {
      setIsRequestingRefresh(false);
    }
  }

  async function trackCandidateBet(input: UserRaceBetInput) {
    try {
      setTrackedBetError(null);
      setTrackedBetMessage(null);
      await saveUserRaceBet(input);
      setTrackedBets(await fetchUserRaceBets());
      setTrackedBetMessage(`${formatBookmaker(input.bookmaker)} bet tracked for ${input.courseName} R${input.raceNumber}.`);
    } catch (error) {
      setTrackedBetError(error instanceof Error ? error.message : "Could not track bet candidate.");
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.subheading}>Bet candidates</Text>
          <Text style={styles.sectionNote}>
            {betCandidateScan?.scannedRaceCount ?? 0} current races scanned ·{" "}
            {betCandidateScan?.eligibleRaceCount ?? 0} priced candidates ·{" "}
            {betCandidateScan?.scannedMeetings ?? 0} meetings
          </Text>
          <Text style={styles.sectionNote}>
            Current model {selectedModelRun?.label ?? "Global bucket blend"}
          </Text>
          <Text style={styles.sectionNote}>{statusLabel}</Text>
          <Text style={styles.sectionNote}>
            Snapshot age {formatCacheAge(cacheAgeMs)}
            {predictionWindowClosedNow ? " · pre-race snapshot locked" : " · refresh before first race"}
          </Text>
        </View>
        <Pressable
          disabled={isRequestingRefresh}
          onPress={refreshCandidates}
          style={[
            styles.refreshButton,
            isRequestingRefresh ? styles.refreshButtonDisabled : null,
          ]}
        >
          <Text style={styles.refreshButtonText}>
            {isRequestingRefresh ? "Refreshing" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {candidatesAreStale ? (
        <View style={styles.staleState}>
          <Text style={styles.staleStateText}>
            Bet candidates were captured before the first eligible race, but prices may have changed. Refresh before the first race starts.
          </Text>
          {!hasPredictionRefreshEndpoint ? (
            <Text style={styles.staleStateText}>
              No app refresh endpoint is configured. Run the current-predictions worker or add
              EXPO_PUBLIC_PREDICTION_REFRESH_URL.
            </Text>
          ) : null}
        </View>
      ) : null}

      {predictionWindowClosedNow ? (
        <View style={styles.staleState}>
          <Text style={styles.staleStateText}>
            Prediction window is closed for today. Showing the stored pre-race snapshot captured before {payload?.predictionWindow?.firstRaceStartNz ?? "the first eligible race"}.
          </Text>
        </View>
      ) : null}

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      {refreshMessage ? <Text style={styles.contextText}>{refreshMessage}</Text> : null}
      {trackedBetError ? (
        <Text style={styles.errorText}>{trackedBetError}</Text>
      ) : trackedBetMessage ? (
        <Text style={styles.contextText}>{trackedBetMessage}</Text>
      ) : null}

      <SignalGuide modelKey={selectedModelKey} modelLabel={selectedModelRun?.label ?? "Global bucket blend"} />

      {!payload ? (
        <StateMessage text={getUnavailableMessage(status)} />
      ) : betCandidates.length ? (
        <>
          <View style={styles.disciplineTabs}>
            {candidatesByDiscipline.map((group) => {
              const isActive = group.code === activeCandidateGroup?.code;

              return (
                <Pressable
                  key={group.code}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setSelectedDisciplineCode(group.code)}
                  style={[
                    styles.disciplineTab,
                    isActive ? styles.disciplineTabActive : null,
                  ]}
                >
                  <Text style={[
                    styles.disciplineTabText,
                    isActive ? styles.disciplineTabTextActive : null,
                  ]}
                  >
                    {group.label} {group.candidates.length}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeCandidateGroup ? (
            <View key={activeCandidateGroup.code} style={styles.candidateGroup}>
              <Text style={styles.candidateGroupHeading}>{activeCandidateGroup.label}</Text>
              {activeCandidateGroup.candidates.map((race) => (
                <View key={race.raceCardId} style={styles.candidateCard}>
                  <View style={styles.candidateHeader}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{race.rank}</Text>
                    </View>
                    <View style={styles.candidateTitleBlock}>
                      <Text style={styles.raceTitle}>
                        R{race.raceNumber} {race.sourceTrack}
                      </Text>
                      <Text style={styles.raceMeta}>
                        {formatDateTime(race.advertisedStart)} · {race.starters} starters ·{" "}
                        {race.code}
                      </Text>
                    </View>
                    <View style={[styles.signalBadge, styles[`signal_${race.candidate.tone}`]]}>
                      <Text style={styles.signalText}>
                        {formatCandidatePillLabel(race.candidate.label, selectedModelKey)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.raceName}>{race.raceName}</Text>

                  <View style={styles.metricGrid}>
                    <Metric
                      label="Favourite"
                      value={race.favourite
                        ? `#${race.favourite.number} ${race.favourite.name}`
                        : "Price unavailable"}
                    />
                    <Metric
                      label="Fixed win"
                      value={formatCurrency(race.favourite?.fixedWinPrice ?? null)}
                    />
                    <Metric
                      label={modelScoreLabel}
                      value={formatCurrency(getCandidateCashAverage(race, selectedModelKey))}
                      detail={`${race.candidate.sampleSize} bucket selections`}
                    />
                    <Metric
                      label="Cash+bonus avg"
                      value={formatCurrency(race.candidate.blendedCashPlusBonusAverage)}
                      detail="Supporting context"
                    />
                    <Metric
                      label="Other avg fixed win"
                      value={formatCurrency(race.fieldPriceShape?.otherStartersAverageFixedWinPrice ?? null)}
                      detail={formatOtherStartersPriceShape(race)}
                    />
                  </View>

                  <View style={styles.metricGrid}>
                    <Metric
                      label="Price bucket"
                      value={race.historical.priceBucket
                        ? race.historical.priceBucket.label
                        : "-"}
                      detail={race.historical.priceBucket
                        ? `${formatCurrency(race.historical.priceBucket.averageReturnPerDollar)} cash avg · ${formatCurrency(race.historical.priceBucket.averageValuePerDollarWithBonusCredit)} cash+bonus · ${formatPercentage(race.historical.priceBucket.bonusBetCreditPercentage)} bonus hit`
                        : undefined}
                    />
                    <Metric
                      label="Starter bucket"
                      value={race.historical.starterBucket
                        ? `${race.historical.starterBucket.label} starters`
                        : "-"}
                      detail={race.historical.starterBucket
                        ? `${formatCurrency(race.historical.starterBucket.averageReturnPerDollar)} cash avg · ${formatCurrency(race.historical.starterBucket.averageValuePerDollarWithBonusCredit)} cash+bonus`
                        : undefined}
                    />
                    <Metric
                      label="MarketMover"
                      value={race.marketMover
                        ? `#${race.marketMover.number} ${race.marketMover.name}`
                        : "-"}
                    />
                  </View>

                  <Text style={styles.contextText}>{race.candidate.detail}</Text>
                  <TrackBetButton
                    disabledReason={getTrackBetDisabledReason(Boolean(user), race)}
                    isLogged={isUserRaceBetLogged(trackedBets, race.raceCardId, "betcha")}
                    onPress={() => trackCandidateBet(createCandidateBetInput({
                      payload,
                      race,
                    }))}
                  />
                </View>
              ))}
              </View>
          ) : null}
        </>
      ) : (
        <StateMessage text="No priced bet candidates are available in the Supabase prediction snapshot." />
      )}
    </View>
  );
}

/**
 * Groups current bet candidates into stable discipline sections for scanning.
 */
function groupBetCandidatesByDiscipline(candidates: BetCandidate[], modelKey: string) {
  const labels = {
    greyhound: "Greyhound",
    harness: "Harness",
    horse: "Horse",
  } satisfies Record<"greyhound" | "harness" | "horse", string>;
  const disciplineOrder = ["horse", "harness", "greyhound"];
  const grouped = new Map<string, BetCandidate[]>();

  for (const candidate of candidates) {
    const matchingCandidates = grouped.get(candidate.code) ?? [];
    matchingCandidates.push(candidate);
    grouped.set(candidate.code, matchingCandidates);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => {
      const leftIndex = disciplineOrder.indexOf(left);
      const rightIndex = disciplineOrder.indexOf(right);

      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }

      return left.localeCompare(right);
    })
    .map(([code, groupCandidates]) => ({
      candidates: groupCandidates
        .sort((left, right) => {
          const rightScore = getCandidateModelScore(right, modelKey) ?? -Infinity;
          const leftScore = getCandidateModelScore(left, modelKey) ?? -Infinity;

          if (rightScore !== leftScore) {
            return rightScore - leftScore;
          }

          return new Date(left.advertisedStart).valueOf()
            - new Date(right.advertisedStart).valueOf();
        })
        .map((candidate, index) => ({
          ...candidate,
          rank: index + 1,
        })),
      code,
      label: code in labels
        ? labels[code as keyof typeof labels]
        : code,
    }));
}

/**
 * Reads the active model score used for recommendation ordering.
 */
function getCandidateModelScore(race: BetCandidate, modelKey: string) {
  return race.predictionModels?.[modelKey]?.cashAverageScore
    ?? race.candidate.cashAverageScore
    ?? getCandidateCashAverage(race, modelKey);
}

/**
 * Estimates the cash return per $1 from available cash-return history when snapshots predate cashAverageScore.
 */
function getCandidateCashAverage(race: BetCandidate, modelKey: string) {
  return race.predictionModels?.[modelKey]?.cashAverageScore
    ?? race.candidate.cashAverageScore
    ?? getOtherStartersAverageCashAverage(race, modelKey)
    ?? weightedAverage(getCashReturnWeights(modelKey).map(({ field, weight }) => ({
      value: field === "price"
        ? race.historical.priceBucket?.averageReturnPerDollar
        : race.historical.starterBucket?.averageReturnPerDollar,
      weight,
    })));
}

function isPredictionWindowClosedError(error: Error) {
  return error.message.includes("Prediction window closed");
}

/**
 * Appends the active model's metric basis to generic recommendation labels.
 */
function formatCandidatePillLabel(label: string, modelKey: string) {
  const baseLabel = label.replace(/ candidate$/i, "");

  if (!["Positive", "Neutral", "Weak"].includes(baseLabel)) {
    return label;
  }

  return `${baseLabel} ${getCandidatePillMetricLabel(modelKey)}`;
}

/**
 * Keeps status pill wording aligned to the active prediction model's cash score.
 */
function getCandidatePillMetricLabel(modelKey: string) {
  if (
    modelKey === "global_bucket_blend_v1"
    || modelKey === "global_bucket_cash_blend_v1"
  ) {
    return "cash blend";
  }

  if (modelKey === "global_bucket_cash_even_blend_v1") {
    return "cash 50/50";
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return "price cash";
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return "starter cash";
  }

  if (modelKey === "global_other_starters_average_price_cash_v1") {
    return "other avg cash";
  }

  if (modelKey === "country_code_bucket_blend_shrunk_v1") {
    return "scoped cash";
  }

  if (modelKey === "country_code_distance_condition_v1") {
    return "condition cash";
  }

  return "cash";
}

/**
 * Reads the other-starters average price cash bucket for legacy snapshots.
 */
function getOtherStartersAverageCashAverage(race: BetCandidate, modelKey: string) {
  return modelKey === "global_other_starters_average_price_cash_v1"
    ? race.historical.otherStartersAveragePriceBucket?.averageReturnPerDollar ?? null
    : null;
}

/**
 * Provides cash-only fallback weights for snapshots created before model-specific cash scores existed.
 */
function getCashReturnWeights(modelKey: string) {
  if (
    modelKey === "global_bucket_blend_v1"
    || modelKey === "global_bucket_cash_blend_v1"
    || modelKey === "country_code_bucket_blend_shrunk_v1"
    || modelKey === "country_code_distance_condition_v1"
  ) {
    return [
      {
        field: "price" as const,
        weight: 0.65,
      },
      {
        field: "starter" as const,
        weight: 0.35,
      },
    ];
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return [
      {
        field: "price" as const,
        weight: 1,
      },
      {
        field: "starter" as const,
        weight: 0,
      },
    ];
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return [
      {
        field: "price" as const,
        weight: 0,
      },
      {
        field: "starter" as const,
        weight: 1,
      },
    ];
  }

  return [
    {
      field: "price" as const,
      weight: 0.5,
    },
    {
      field: "starter" as const,
      weight: 0.5,
    },
  ];
}

/**
 * Combines available numeric metric values and renormalises when one bucket is missing.
 */
function weightedAverage(entries: { value: number | undefined; weight: number }[]) {
  const usableEntries = entries.filter((entry): entry is { value: number; weight: number } =>
    typeof entry.value === "number" && Number.isFinite(entry.value),
  );
  const totalWeight = usableEntries.reduce((total, entry) => total + entry.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return usableEntries.reduce((total, entry) => total + (entry.value * entry.weight), 0) / totalWeight;
}

function createSnapshotFromPayload(payload: RecommendationPayload) {
  return {
    generatedAt: payload.generatedAt,
    generatedAtNz: payload.generatedAtNz ?? null,
    payload,
    sourceDate: payload.sourceDate,
    sourceTable: "current_prediction_snapshots" as const,
  };
}

function getUnavailableMessage(status: BetCandidateStatus) {
  if (status === "loading") {
    return "Checking Supabase for the latest candidate snapshot.";
  }

  if (status === "unconfigured") {
    return "Bet candidates require EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.";
  }

  if (status === "empty") {
      return "Run the prediction refresh Edge Function or wait for the next scheduled refresh to populate current_prediction_snapshots.";
  }

  return "Bet candidates could not be loaded from Supabase.";
}

function isSnapshotStale(value: string | null) {
  if (!value) {
    return true;
  }

  const generatedAt = new Date(value).valueOf();

  return Number.isNaN(generatedAt) || Date.now() - generatedAt > PROMOTION_CACHE_MAX_AGE_MS;
}

function isPredictionWindowClosedNow(window: RecommendationPayload["predictionWindow"] | undefined) {
  if (!window?.firstRaceStart) {
    return false;
  }

  const firstRaceStart = new Date(window.firstRaceStart).valueOf();

  return Number.isFinite(firstRaceStart) && Date.now() >= firstRaceStart;
}

function formatCacheAge(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "unknown";
  }

  const minutes = Math.max(0, Math.floor(value / 60000));

  if (minutes < 1) {
    return "under 1 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

function formatOtherStartersPriceShape(race: BetCandidate) {
  const shape = race.fieldPriceShape;

  if (!shape) {
    return undefined;
  }

  const outlierDetail = shape.otherStartersPriceOutlierCount
    ? ` · ${shape.otherStartersPriceOutlierCount} at $${shape.outlierCutoff}+ excluded`
    : "";

  return `${shape.otherStartersAveragePriceBucket ?? "No bucket"} · ${shape.otherStartersPriceCount} prices${outlierDetail}`;
}

function formatPercentage(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
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

function getTrackBetDisabledReason(isSignedIn: boolean, race: RecommendationRace) {
  if (!isSignedIn) {
    return "Sign in to track";
  }

  if (!getTrackableRunner(race)) {
    return "No runner to track";
  }

  return null;
}

function getTrackableRunner(race: RecommendationRace) {
  return race.targetRunner ?? race.favourite;
}

function createCandidateBetInput({
  payload,
  race,
}: {
  payload: RecommendationPayload;
  race: BetCandidate;
}): UserRaceBetInput {
  const runner = getTrackableRunner(race);

  return {
    advertisedStart: race.advertisedStart,
    bookmaker: "betcha",
    country: null,
    courseName: race.sourceTrack,
    courseSlug: null,
    promotionKind: "bet_candidate",
    promotionLabel: race.candidate.detail,
    raceCode: race.code as UserRaceBetInput["raceCode"],
    raceName: race.raceName,
    raceNumber: race.raceNumber,
    rank: race.rank,
    raw: race as unknown as Record<string, unknown>,
    selectedFixedWinPrice: runner?.fixedWinPrice ?? null,
    selectedRunnerName: runner?.name ?? null,
    selectedRunnerNumber: runner?.number ?? null,
    selectedStarterCount: race.starters,
    signalLabel: race.candidate.label,
    source: payload.betBackCandidates?.source ?? "betcha",
    sourceDate: payload.sourceDate,
    sourceRaceCardId: race.raceCardId,
    sourceTimeZone: payload.sourceTimeZone ?? SOURCE_TIME_ZONE,
    sourceTrack: race.sourceTrack,
  };
}

type TrackBetButtonProps = {
  disabledReason: string | null;
  isLogged: boolean;
  onPress: () => void;
};

type SignalGuideProps = {
  modelKey: string;
  modelLabel: string;
};

/**
 * Explains the active model's cash score thresholds without mixing in bonus context.
 */
function SignalGuide({ modelKey, modelLabel }: SignalGuideProps) {
  const explanation = getSignalGuideExplanation(modelKey);

  return (
    <View style={styles.signalGuide}>
      <Text style={styles.signalGuideTitle}>{modelLabel} signals</Text>
      <Text style={styles.signalGuideText}>{explanation}</Text>
      <View style={styles.signalGuidePills}>
        <Text style={[styles.signalGuidePill, styles.signalGuidePositive]}>Positive &gt;= $1.05</Text>
        <Text style={[styles.signalGuidePill, styles.signalGuideNeutral]}>Neutral $0.95-$1.04</Text>
        <Text style={[styles.signalGuidePill, styles.signalGuideWeak]}>Weak &lt; $0.95</Text>
      </View>
      <Text style={styles.signalGuideText}>
        Small sample means fewer than 10 matching historical selections. Limited history means no usable cash average for the active model.
      </Text>
    </View>
  );
}

/**
 * Returns the cash-score formula shown in the candidate signal guide for each model.
 */
function getSignalGuideExplanation(modelKey: string) {
  if (modelKey === "global_bucket_cash_even_blend_v1") {
    return "Score estimates cash returned per $1 using 50% favourite price-bucket cash average and 50% starter-count cash average.";
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return "Score estimates cash returned per $1 using only the matching favourite price-bucket cash average.";
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return "Score estimates cash returned per $1 using only the matching final-starter-count cash average.";
  }

  if (modelKey === "global_other_starters_average_price_cash_v1") {
    return "Score estimates cash returned per $1 using the matching other-starters average fixed-win price bucket, excluding $70+ outlier prices.";
  }

  if (modelKey === "country_code_bucket_blend_shrunk_v1") {
    return "Score estimates cash returned per $1 using 65% scoped price-bucket cash average and 35% scoped starter-count cash average, shrunk toward global cash buckets.";
  }

  if (modelKey === "country_code_distance_condition_v1") {
    return "Score estimates cash returned per $1 using scoped cash averages: 45% price bucket, 25% starter count, 20% distance band, and 10% track condition.";
  }

  return "Score estimates cash returned per $1 using 65% favourite price-bucket cash average and 35% starter-count cash average.";
}

function TrackBetButton({ disabledReason, isLogged, onPress }: TrackBetButtonProps) {
  const isDisabled = Boolean(disabledReason);

  return (
    <Pressable
      disabled={isDisabled || isLogged}
      onPress={onPress}
      style={[
        styles.trackBetButton,
        isLogged ? styles.trackBetButtonLogged : null,
        isDisabled ? styles.trackBetButtonDisabled : null,
      ]}
    >
      <Text style={[
        styles.trackBetButtonText,
        isLogged ? styles.trackBetButtonTextLogged : null,
      ]}
      >
        {isLogged
          ? "Betcha tracked"
          : disabledReason
            ? disabledReason
            : "Track Betcha bet"}
      </Text>
    </Pressable>
  );
}

type MetricProps = {
  detail?: string;
  label: string;
  value: string;
};

function Metric({ detail, label, value }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

type StateMessageProps = {
  text: string;
};

function StateMessage({ text }: StateMessageProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  candidateCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  candidateGroup: {
    marginTop: 12,
  },
  candidateGroupHeading: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "900",
  },
  candidateHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  candidateTitleBlock: {
    flex: 1,
  },
  contextText: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  disciplineTab: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 6,
    borderWidth: 1,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  disciplineTabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  disciplineTabText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "900",
  },
  disciplineTabTextActive: {
    color: "#ffffff",
  },
  disciplineTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  emptyState: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  emptyStateText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 8,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  metric: {
    flex: 1,
    minWidth: 92,
  },
  metricDetail: {
    color: "#667085",
    fontSize: 11,
    marginTop: 2,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  metricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  metricValue: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  panel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  raceMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  raceName: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 8,
  },
  raceTitle: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  rankBadge: {
    alignItems: "center",
    backgroundColor: "#18202f",
    borderRadius: 6,
    height: 30,
    justifyContent: "center",
    width: 34,
  },
  rankText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  refreshButton: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshButtonDisabled: {
    opacity: 0.55,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  sectionNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  signalGuide: {
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  signalGuideNeutral: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  signalGuidePill: {
    borderRadius: 6,
    borderWidth: 1,
    color: "#18202f",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  signalGuidePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  signalGuidePositive: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
  },
  signalGuideText: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  signalGuideTitle: {
    color: "#18202f",
    fontSize: 12,
    fontWeight: "900",
  },
  signalGuideWeak: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  signal_caution: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  signal_muted: {
    backgroundColor: "#f2f4f7",
    borderColor: "#d0d5dd",
  },
  signal_neutral: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  signal_positive: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
  },
  signalBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  signalText: {
    color: "#18202f",
    fontSize: 11,
    fontWeight: "900",
  },
  staleState: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  staleStateText: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
  },
  trackBetButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#175cd3",
    borderColor: "#175cd3",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackBetButtonDisabled: {
    opacity: 0.55,
  },
  trackBetButtonLogged: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  trackBetButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  trackBetButtonTextLogged: {
    color: "#067647",
  },
});
