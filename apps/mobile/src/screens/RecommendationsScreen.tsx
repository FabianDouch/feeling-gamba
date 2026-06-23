import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../data/authSession";
import {
  fetchLatestPromotionSnapshot,
  hasPromotionRefreshEndpoint,
  hasSupabasePromotionCacheConfig,
  requestPromotionRefresh,
} from "../data/supabasePromotions";
import {
  SOURCE_TIME_ZONE,
  type RecommendationPayload,
  type RecommendationPromotion,
  type RecommendationRace,
} from "../data/promotionPayload";
import {
  fetchUserRaceBets,
  formatBookmaker,
  isUserRaceBetLogged,
  saveUserRaceBet,
  type UserRaceBet,
  type UserRaceBetInput,
} from "../data/userRaceBets";

type PromotionDataSourceStatus = "empty" | "error" | "loading" | "supabase" | "unconfigured";

type RecommendationsScreenProps = {
  refreshSignal: number;
};

const PROMOTION_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Formats optional money values while preserving explicit unavailable states.
 */
function formatCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

/**
 * Formats optional percentages while preserving explicit unavailable states.
 */
function formatPercentage(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

/**
 * Converts a timestamp into the Auckland racing timezone used by racing source data.
 */
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

/**
 * Reads today's Auckland date so the app can identify stale promotion snapshots.
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

/**
 * Checks whether a promotion cache timestamp is older than the live-racing refresh target.
 */
function isSnapshotStale(value: string | null) {
  if (!value) {
    return true;
  }

  const generatedAt = new Date(value).valueOf();

  return Number.isNaN(generatedAt) || Date.now() - generatedAt > PROMOTION_CACHE_MAX_AGE_MS;
}

/**
 * Formats cache age for the Promos status line without implying exact source freshness.
 */
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

/**
 * Blends available historical buckets using the same weighting as bet-back candidate ranking.
 */
function getCashBonusAverage(race: RecommendationRace) {
  const entries = [
    {
      value: race.historical.priceBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.65,
    },
    {
      value: race.historical.starterBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.35,
    },
  ].filter((entry) => Number.isFinite(entry.value));
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return entries.reduce((total, entry) => total + (Number(entry.value) * entry.weight), 0)
    / totalWeight;
}

/**
 * Counts the historical selections behind the rendered promotion signal buckets.
 */
function getBucketSampleSize(race: RecommendationRace) {
  return (race.historical.priceBucket?.favouriteSelections ?? 0)
    + (race.historical.starterBucket?.favouriteSelections ?? 0);
}

/**
 * Reads the latest Supabase promotion cache row, leaving source fetching to backend jobs.
 */
async function loadLatestSupabasePromotionSnapshot() {
  return fetchLatestPromotionSnapshot<RecommendationPayload>();
}

/**
 * Wraps a freshly generated promotion payload in the same shape as a Supabase cache row.
 */
function createSnapshotFromPayload(payload: RecommendationPayload) {
  return {
    generatedAt: payload.generatedAt,
    generatedAtNz: payload.generatedAtNz ?? null,
    payload,
    sourceDate: payload.sourceDate,
    sourceTable: "current_promotion_snapshots" as const,
  };
}

export function RecommendationsScreen({ refreshSignal }: RecommendationsScreenProps) {
  const { user } = useAuth();
  const [promotionRecommendations, setPromotionRecommendations] = useState<RecommendationPayload | null>(null);
  const [dataSourceStatus, setDataSourceStatus] = useState<PromotionDataSourceStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);
  const [isRequestingFreshRecommendations, setIsRequestingFreshRecommendations] = useState(false);
  const [trackedBets, setTrackedBets] = useState<UserRaceBet[]>([]);
  const [trackedBetMessage, setTrackedBetMessage] = useState<string | null>(null);
  const [trackedBetError, setTrackedBetError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadPromotionCache() {
      if (!hasSupabasePromotionCacheConfig) {
        setPromotionRecommendations(null);
        setSnapshotGeneratedAt(null);
        setDataSourceStatus("unconfigured");
        setLoadError("Supabase is not configured for promotion recommendations.");
        return;
      }

      setDataSourceStatus("loading");
      setLoadError(null);

      try {
        let latestSnapshot = await loadLatestSupabasePromotionSnapshot();

        if (!isActive) {
          return;
        }

        if (latestSnapshot && isSnapshotStale(latestSnapshot.generatedAt) && hasPromotionRefreshEndpoint) {
          setIsRequestingFreshRecommendations(true);
          setRefreshMessage("Refreshing stale promotion recommendations.");
          const refreshedPayload = await requestPromotionRefresh<RecommendationPayload>();
          latestSnapshot = refreshedPayload
            ? createSnapshotFromPayload(refreshedPayload)
            : await loadLatestSupabasePromotionSnapshot();
        }

        if (latestSnapshot) {
          setPromotionRecommendations(latestSnapshot.payload);
          setSnapshotGeneratedAt(latestSnapshot.generatedAt);
          setDataSourceStatus("supabase");
          setLoadError(null);
          setRefreshMessage(null);
        } else {
          setPromotionRecommendations(null);
          setSnapshotGeneratedAt(null);
          setDataSourceStatus("empty");
          setRefreshMessage("No Supabase promotion snapshot is available yet.");
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setDataSourceStatus("error");
        setPromotionRecommendations(null);
        setSnapshotGeneratedAt(null);
        setLoadError(error instanceof Error ? error.message : "Could not load Supabase cache.");
      } finally {
        if (isActive) {
          setIsRequestingFreshRecommendations(false);
        }
      }
    }

    loadPromotionCache();

    return () => {
      isActive = false;
    };
  }, [refreshSignal]);

  useEffect(() => {
    let isActive = true;

    async function loadTrackedBets() {
      if (!user) {
        setTrackedBets([]);
        return;
      }

      try {
        setTrackedBetError(null);
        const nextTrackedBets = await fetchUserRaceBets();

        if (isActive) {
          setTrackedBets(nextTrackedBets);
        }
      } catch (error) {
        if (isActive) {
          setTrackedBetError(error instanceof Error ? error.message : "Could not load tracked promo bets.");
        }
      }
    }

    loadTrackedBets();

    return () => {
      isActive = false;
    };
  }, [user]);

  /**
   * Requests fresh promotion recommendations when a backend refresh endpoint is configured.
   */
  async function refreshRecommendations() {
    if (!hasSupabasePromotionCacheConfig) {
      setPromotionRecommendations(null);
      setSnapshotGeneratedAt(null);
      setDataSourceStatus("unconfigured");
      setRefreshMessage("Supabase is not configured for promotion recommendations.");
      return;
    }

    try {
      setIsRequestingFreshRecommendations(true);
      setDataSourceStatus("loading");
      setLoadError(null);

      let refreshedPayload: RecommendationPayload | null = null;

      if (hasPromotionRefreshEndpoint) {
        setRefreshMessage("Requesting fresh promotion recommendations.");
        refreshedPayload = await requestPromotionRefresh<RecommendationPayload>();
      } else {
        setRefreshMessage("No refresh endpoint configured. Re-checking the latest Supabase cache.");
      }

      const latestSnapshot = refreshedPayload
        ? createSnapshotFromPayload(refreshedPayload)
        : await loadLatestSupabasePromotionSnapshot();

      if (latestSnapshot) {
        setPromotionRecommendations(latestSnapshot.payload);
        setSnapshotGeneratedAt(latestSnapshot.generatedAt);
        setDataSourceStatus("supabase");
        setRefreshMessage(hasPromotionRefreshEndpoint
          ? "Fresh promotion recommendations loaded."
          : "Supabase cache rechecked. Configure EXPO_PUBLIC_PROMOTION_REFRESH_URL to generate new recommendations from the app.");
      } else {
        setPromotionRecommendations(null);
        setSnapshotGeneratedAt(null);
        setDataSourceStatus("empty");
        setRefreshMessage("No Supabase promotion cache row is available.");
      }
    } catch (error) {
      setDataSourceStatus("error");
      setPromotionRecommendations(null);
      setSnapshotGeneratedAt(null);
      setLoadError(error instanceof Error ? error.message : "Could not refresh promotion recommendations.");
    } finally {
      setIsRequestingFreshRecommendations(false);
    }
  }

  /**
   * Saves one visible promotion race as a manual user bet record for later outcome tracking.
   */
  async function trackPromotionBet(input: UserRaceBetInput) {
    if (!user) {
      setTrackedBetError("Sign in to track promo bets.");
      return;
    }

    try {
      setTrackedBetError(null);
      setTrackedBetMessage(null);
      await saveUserRaceBet(input);
      setTrackedBets(await fetchUserRaceBets());
      setTrackedBetMessage("Promo bet saved to your account.");
    } catch (error) {
      setTrackedBetError(error instanceof Error ? error.message : "Could not save promo bet.");
    }
  }

  const promotions = promotionRecommendations?.sources.flatMap((source) =>
    source.recommendations.map((promotion) => ({
      ...promotion,
      sourceKey: source.source,
    })),
  ) ?? [];
  const racePromotions = promotions.filter((promotion) => promotion.races.length > 0);
  const activePromotionCount = promotionRecommendations?.sources.reduce(
    (total, source) => total + source.allPromotionCount,
    0,
  ) ?? 0;
  const sourceDateIsCurrent = promotionRecommendations?.sourceDate === getTodayInSourceTimeZone();
  const cacheAgeMs = snapshotGeneratedAt ? Date.now() - new Date(snapshotGeneratedAt).valueOf() : null;
  const cacheIsOlderThanTarget = isSnapshotStale(snapshotGeneratedAt);
  const recommendationsAreStale = Boolean(promotionRecommendations)
    && (!sourceDateIsCurrent || cacheIsOlderThanTarget);
  const statusLabel = dataSourceStatus === "supabase"
    ? "Loaded from Supabase cache"
    : dataSourceStatus === "loading"
      ? isRequestingFreshRecommendations
        ? "Refreshing recommendations"
        : "Checking Supabase cache"
      : dataSourceStatus === "unconfigured"
        ? "Supabase promotions are not configured"
        : dataSourceStatus === "empty"
          ? "No Supabase promotion snapshot available"
          : "Supabase promotion cache unavailable";
  const unavailableMessage = dataSourceStatus === "loading"
    ? "Checking Supabase for the latest promotion snapshot."
    : dataSourceStatus === "unconfigured"
      ? "Promotion signals require EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY."
      : dataSourceStatus === "empty"
        ? "Run the promotion refresh Edge Function or wait for the next scheduled refresh to populate current_promotion_snapshots."
        : "Promotion signals could not be loaded from Supabase.";

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Recommendations</Text>
          <Text style={styles.heading}>Promotion signals</Text>
          <Text style={styles.headerNote}>
            {racePromotions.length} race-specific promos ·{" "}
            {activePromotionCount} active source promos checked ·{" "}
            {promotionRecommendations?.statsBasis.basisLabel
              ?? "No Supabase promotion payload"}
          </Text>
          {promotionRecommendations ? (
            <Text style={styles.headerNote}>
              Refreshed {promotionRecommendations.generatedAtNz ?? formatDateTime(
                promotionRecommendations.generatedAt,
              )}
            </Text>
          ) : null}
          <Text style={styles.headerNote}>
            {statusLabel}
          </Text>
          <Text style={styles.headerNote}>
            Cache age {formatCacheAge(cacheAgeMs)} · freshness target 15 mins
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.datePill}>
            NZ date {promotionRecommendations?.sourceDate ?? "-"}
          </Text>
          <Pressable
            disabled={isRequestingFreshRecommendations}
            onPress={refreshRecommendations}
            style={[
              styles.refreshButton,
              isRequestingFreshRecommendations ? styles.refreshButtonDisabled : null,
            ]}
          >
            <Text style={styles.refreshButtonText}>
              {isRequestingFreshRecommendations ? "Refreshing" : "Refresh"}
            </Text>
          </Pressable>
        </View>
      </View>

      {recommendationsAreStale ? (
        <View style={styles.staleState}>
          <Text style={styles.staleStateText}>
            Promotion recommendations are stale. Refresh current signals before comparing live race
            cards.
          </Text>
          {!hasPromotionRefreshEndpoint ? (
            <Text style={styles.staleStateText}>
              No app refresh endpoint is configured yet. Run the current-promotions worker or add
              EXPO_PUBLIC_PROMOTION_REFRESH_URL to let the app generate fresh recommendations.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.disclaimer}>
        Statistical signal only. No stake sizing or automated wagering.
      </Text>

      {loadError ? (
        <Text style={styles.contextText}>{loadError}</Text>
      ) : null}

      {refreshMessage ? (
        <Text style={styles.contextText}>{refreshMessage}</Text>
      ) : null}

      {trackedBetError ? (
        <Text style={styles.errorText}>{trackedBetError}</Text>
      ) : trackedBetMessage ? (
        <Text style={styles.contextText}>{trackedBetMessage}</Text>
      ) : null}

      {!promotionRecommendations ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {unavailableMessage}
          </Text>
        </View>
      ) : (
        <>
          {racePromotions.length ? racePromotions.map((promotion) => (
            <View key={promotion.id} style={styles.promotionCard}>
          <View style={styles.promotionHeader}>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>{promotion.provider}</Text>
            </View>
            <Text style={styles.expiryText}>Expires {formatDateTime(promotion.expiry)}</Text>
          </View>
          <Text style={styles.promotionDescription}>{promotion.description}</Text>

          {promotion.races.map((race) => (
            <View key={`${promotion.id}-${race.raceCardId}`} style={styles.racePanel}>
              <View style={styles.raceHeader}>
                <View>
                  <Text style={styles.raceTitle}>
                    R{race.raceNumber} {race.track}
                  </Text>
                  <Text style={styles.raceMeta}>
                    {formatDateTime(race.advertisedStart)} · {race.starters} starters ·{" "}
                    {race.code}
                  </Text>
                </View>
                <View style={[styles.signalBadge, styles[`signal_${race.signal.tone}`]]}>
                  <Text style={styles.signalText}>{race.signal.label}</Text>
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
                  label="Implied"
                  value={formatPercentage(race.favourite?.impliedWinPercentage ?? null)}
                />
              </View>

              <View style={styles.metricGrid}>
                <Metric
                  label="Starter history"
                  value={race.historical.starterBucket
                    ? `${formatPercentage(race.historical.starterBucket.winPercentage)} win`
                    : "-"}
                  detail={race.historical.starterBucket
                    ? `${race.historical.starterBucket.favouriteSelections} selections`
                    : undefined}
                />
                <Metric
                  label="Price history"
                  value={race.historical.priceBucket
                    ? `${formatPercentage(race.historical.priceBucket.winPercentage)} win`
                    : "-"}
                  detail={race.historical.priceBucket
                    ? race.historical.priceBucket.label
                    : undefined}
                />
                <Metric
                  label="MarketMover"
                  value={race.marketMover
                    ? `#${race.marketMover.number} ${race.marketMover.name}`
                    : "-"}
                />
              </View>

              <View style={styles.metricGrid}>
                <Metric
                  label="Cash+bonus avg"
                  value={formatCurrency(getCashBonusAverage(race))}
                  detail={getBucketSampleSize(race)
                    ? `${getBucketSampleSize(race)} bucket selections`
                    : undefined}
                />
                <Metric
                  label="Starter bucket"
                  value={race.historical.starterBucket
                    ? `${race.historical.starterBucket.label} starters`
                    : "-"}
                  detail={race.historical.starterBucket
                    ? `${formatCurrency(
                      race.historical.starterBucket.averageValuePerDollarWithBonusCredit,
                    )} avg`
                    : undefined}
                />
                <Metric
                  label="Price bucket"
                  value={race.historical.priceBucket
                    ? race.historical.priceBucket.label
                    : "-"}
                  detail={race.historical.priceBucket
                    ? `${formatPercentage(
                      race.historical.priceBucket.bonusBetCreditPercentage,
                    )} bonus hit`
                    : undefined}
                />
              </View>

              {race.targetRunner ? (
                <Text style={styles.contextText}>
                  Promo target: #{race.targetRunner.number} {race.targetRunner.name} ·{" "}
                  {formatCurrency(race.targetRunner.fixedWinPrice)}
                </Text>
              ) : null}
              <Text style={styles.contextText}>{race.signal.detail}</Text>
              <TrackBetButton
                bookmaker={getPromotionBookmaker(promotion)}
                disabledReason={getTrackBetDisabledReason(Boolean(user), race)}
                isLogged={isUserRaceBetLogged(
                  trackedBets,
                  race.raceCardId,
                  getPromotionBookmaker(promotion),
                )}
                onPress={() => trackPromotionBet(createRacePromotionBetInput({
                  payload: promotionRecommendations,
                  promotion,
                  race,
                }))}
              />
            </View>
          ))}
        </View>
      )) : null}

        </>
      )}
    </View>
  );
}

type TrackBetButtonProps = {
  bookmaker: UserRaceBetInput["bookmaker"];
  disabledReason: string | null;
  isLogged: boolean;
  onPress: () => void;
};

/**
 * Shows the user-owned manual bet tracking action for one visible promo race.
 */
function TrackBetButton({ bookmaker, disabledReason, isLogged, onPress }: TrackBetButtonProps) {
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
          ? `${formatBookmaker(bookmaker)} tracked`
          : disabledReason
            ? disabledReason
            : `Track ${formatBookmaker(bookmaker)} bet`}
      </Text>
    </Pressable>
  );
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

function getPromotionBookmaker(promotion: RecommendationPromotion & { sourceKey: string }) {
  return `${promotion.provider} ${promotion.sourceKey}`.toLowerCase().includes("tab")
    ? "tab"
    : "betcha";
}

function createRacePromotionBetInput({
  payload,
  promotion,
  race,
}: {
  payload: RecommendationPayload;
  promotion: RecommendationPromotion & { sourceKey: string };
  race: RecommendationRace;
}): UserRaceBetInput {
  const runner = getTrackableRunner(race);

  return {
    advertisedStart: race.advertisedStart,
    bookmaker: getPromotionBookmaker(promotion),
    country: null,
    courseName: race.track,
    courseSlug: null,
    promotionKind: "race_specific_promotion",
    promotionLabel: promotion.description,
    raceCode: race.code as UserRaceBetInput["raceCode"],
    raceName: race.raceName,
    raceNumber: race.raceNumber,
    rank: null,
    raw: race as unknown as Record<string, unknown>,
    selectedFixedWinPrice: runner?.fixedWinPrice ?? null,
    selectedRunnerName: runner?.name ?? null,
    selectedRunnerNumber: runner?.number ?? null,
    selectedStarterCount: race.starters,
    signalLabel: race.signal.label,
    source: promotion.sourceKey,
    sourceDate: payload.sourceDate,
    sourceRaceCardId: race.raceCardId,
    sourceTimeZone: payload.sourceTimeZone ?? SOURCE_TIME_ZONE,
    sourceTrack: race.track,
  };
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
  datePill: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
    borderRadius: 6,
    borderWidth: 1,
    color: "#3730a3",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  disclaimer: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
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
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  expiryText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  headerNote: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  heading: {
    color: "#18202f",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
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
  promotionCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  promotionDescription: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
  },
  promotionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  providerBadge: {
    backgroundColor: "#18202f",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  providerBadgeText: {
    color: "#ffffff",
    fontSize: 11,
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
  raceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
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
  racePanel: {
    backgroundColor: "#ffffff",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  raceTitle: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  sectionNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
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
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 18,
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
