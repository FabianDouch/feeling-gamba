import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fetchInsightMetadata,
  fetchInsights,
  getInsightCourseOptions,
  hasSupabaseInsightsConfig,
  resolveInsightTrackFilter,
  type InsightFilters,
  type InsightMetadata,
} from "../data/supabaseInsights";
import {
  hasTrackRaceOddsConfig,
  requestTrackRaceOdds,
  type TrackRaceOddsResult,
} from "../data/trackRaceOdds";
import type { InsightsData } from "../data/collectedRaceDay";
import type { UserFavouriteTrack } from "../data/userFavouriteTracks";
import { FavouriteTrackControl } from "./FavouriteTrackControl";
import { FavouriteTrackQuickFilter } from "./FavouriteTrackQuickFilter";

const emptyInsights: InsightsData = {
  disciplineReturns: [],
  favouriteStats: [],
  otherStartersAveragePriceBreakdown: [],
  priceBreakdown: [],
  starterBreakdown: [],
};

/**
 * Shows favourite-performance insights scoped by country and race track.
 */
export function InsightsScreen() {
  const [filters, setFilters] = useState<InsightFilters>({
    country: "all",
    course: "all",
    discipline: "all",
  });
  const [metadata, setMetadata] = useState<InsightMetadata | null>(null);
  const [insights, setInsights] = useState<InsightsData>(emptyInsights);
  const [oddsErrorMessage, setOddsErrorMessage] = useState<string | null>(null);
  const [oddsResult, setOddsResult] = useState<TrackRaceOddsResult | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isRequestingOdds, setIsRequestingOdds] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favouritesReloadKey, setFavouritesReloadKey] = useState(0);
  const trackOptions = useMemo(
    () => getInsightCourseOptions(metadata, filters.country),
    [filters.country, metadata],
  );
  const selectedCountryLabel = metadata?.countryOptions
    .find((option) => option.value === filters.country)
    ?.label ?? "All countries";
  const selectedTrackLabel = trackOptions.find((option) => option.value === filters.course)
    ?.label ?? "All tracks";
  const selectedDisciplineLabel = metadata?.disciplineOptions
    .find((option) => option.value === filters.discipline)
    ?.label ?? "All disciplines";
  const selectedTrack = resolveInsightTrackFilter(filters);
  const favouriteTrack = selectedTrack && isRaceCode(filters.discipline)
    ? {
        country: selectedTrack.country,
        courseName: stripCountrySuffix(selectedTrackLabel, selectedTrack.country),
        courseSlug: selectedTrack.course,
        raceCode: filters.discipline,
      }
    : null;
  const canRequestTrackOdds = Boolean(
    selectedTrack
    && filters.discipline !== "all"
    && hasTrackRaceOddsConfig,
  );
  const hasInsightRows = insights.favouriteStats.length > 0
    || insights.disciplineReturns.length > 0
    || insights.starterBreakdown.length > 0
    || insights.priceBreakdown.length > 0
    || insights.otherStartersAveragePriceBreakdown.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!hasSupabaseInsightsConfig) {
        setErrorMessage("Supabase is not configured for Insights.");
        setIsLoadingMetadata(false);
        return;
      }

      try {
        setIsLoadingMetadata(true);
        setErrorMessage(null);
        const nextMetadata = await fetchInsightMetadata();

        if (!cancelled) {
          setMetadata(nextMetadata);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Insights metadata failed to load.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMetadata(false);
        }
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInsights() {
      if (!metadata) {
        return;
      }

      try {
        setIsLoadingInsights(true);
        setErrorMessage(null);
        const nextInsights = await fetchInsights(filters);

        if (!cancelled) {
          setInsights(nextInsights);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Insights failed to load.");
          setInsights(emptyInsights);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInsights(false);
        }
      }
    }

    loadInsights();

    return () => {
      cancelled = true;
    };
  }, [filters, metadata]);

  /**
   * Applies a country scope and clears the track scope so filters stay compatible.
   */
  function updateCountry(value: string) {
    setFilters((current) => ({
      country: value,
      course: "all",
      discipline: current.discipline,
    }));
    setOddsResult(null);
    setOddsErrorMessage(null);
  }

  function updateCourse(value: string) {
    setFilters((current) => ({
      ...current,
      course: value,
    }));
    setOddsResult(null);
    setOddsErrorMessage(null);
  }

  function updateDiscipline(value: string) {
    setFilters((current) => ({
      ...current,
      discipline: value,
    }));
    setOddsResult(null);
    setOddsErrorMessage(null);
  }

  /**
   * Applies a saved track shortcut and clears track-odds state tied to the previous scope.
   */
  function applyFavouriteTrack(track: UserFavouriteTrack) {
    setFilters({
      country: track.country,
      course: track.courseSlug,
      discipline: track.raceCode,
    });
    setOddsResult(null);
    setOddsErrorMessage(null);
  }

  function refreshFavouriteFilters() {
    setFavouritesReloadKey((current) => current + 1);
  }

  /**
   * Requests public odds for races 1 and 2 at the selected track and discipline.
   */
  async function checkFirstTwoRaceOdds() {
    if (!selectedTrack || !isRaceCode(filters.discipline)) {
      return;
    }

    try {
      setIsRequestingOdds(true);
      setOddsErrorMessage(null);
      const nextResult = await requestTrackRaceOdds({
        country: selectedTrack.country,
        courseSlug: selectedTrack.course,
        raceCode: filters.discipline,
      });
      setOddsResult(nextResult);
    } catch (error) {
      setOddsResult(null);
      setOddsErrorMessage(error instanceof Error ? error.message : "Track odds request failed.");
    } finally {
      setIsRequestingOdds(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Insights</Text>
      <Text style={styles.heading}>Collected favourite performance</Text>
      <Text style={styles.trackNote}>
        Showing {selectedCountryLabel} · {selectedTrackLabel} · {selectedDisciplineLabel}
      </Text>

      <FavouriteTrackQuickFilter
        activeTrack={favouriteTrack}
        onSelect={applyFavouriteTrack}
        reloadKey={favouritesReloadKey}
      />

      <FilterGroup
        label="Country"
        onChange={updateCountry}
        options={[{ label: "All countries", value: "all" }, ...(metadata?.countryOptions ?? [])]}
        selectedValue={filters.country}
      />

      <FilterGroup
        label="Track"
        onChange={updateCourse}
        options={trackOptions}
        selectedValue={filters.course}
      />

      <FilterGroup
        label="Discipline"
        onChange={updateDiscipline}
        options={[{ label: "All disciplines", value: "all" }, ...(metadata?.disciplineOptions ?? [])]}
        selectedValue={filters.discipline}
      />

      <FavouriteTrackControl onChange={refreshFavouriteFilters} track={favouriteTrack} />

      {filters.course !== "all" ? (
        <TrackRaceOddsPanel
          canRequest={canRequestTrackOdds}
          errorMessage={oddsErrorMessage}
          isLoading={isRequestingOdds}
          onRequest={checkFirstTwoRaceOdds}
          result={oddsResult}
          selectedDisciplineLabel={selectedDisciplineLabel}
          selectedTrackLabel={selectedTrackLabel}
        />
      ) : null}

      {errorMessage ? (
        <StateMessage tone="error" text={errorMessage} />
      ) : isLoadingMetadata || isLoadingInsights ? (
        <StateMessage text="Loading stored insight aggregates from Supabase." />
      ) : !hasInsightRows ? (
        <StateMessage text="No stored insight aggregates match this scope." />
      ) : (
        <>
          <View style={styles.statsRow}>
            {insights.favouriteStats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statDetail}>{stat.detail}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.subheading}>$1 favourite return by discipline</Text>
          {insights.disciplineReturns.length ? insights.disciplineReturns.map((row) => (
            <View key={row.discipline} style={styles.returnCard}>
              <View style={styles.returnHeader}>
                <View>
                  <Text style={styles.returnDiscipline}>{row.discipline}</Text>
                  <Text style={styles.returnNote}>
                    {row.totalStaked} staked · {row.totalReturned} cash ·{" "}
                    {row.bonusCredit} bonus
                  </Text>
                </View>
                <View style={styles.returnBadge}>
                  <Text style={styles.returnBadgeText}>{row.promoRoi}</Text>
                </View>
              </View>

              <View style={styles.returnGrid}>
                <View style={styles.returnMetric}>
                  <Text style={styles.returnMetricValue}>{row.averageReturn}</Text>
                  <Text style={styles.returnMetricLabel}>Cash avg</Text>
                </View>
                <View style={styles.returnMetric}>
                  <Text style={styles.returnMetricValue}>{row.netReturn}</Text>
                  <Text style={styles.returnMetricLabel}>Cash net</Text>
                </View>
                <View style={styles.returnMetric}>
                  <Text style={styles.returnMetricValue}>{row.bonusAverageReturn}</Text>
                  <Text style={styles.returnMetricLabel}>Bonus avg</Text>
                </View>
                <View style={styles.returnMetric}>
                  <Text style={styles.returnMetricValue}>{row.promoAverageReturn}</Text>
                  <Text style={styles.returnMetricLabel}>Cash+bonus avg</Text>
                </View>
              </View>

              <Text style={styles.missingText}>
                Bonus credits count 2nd for 5-7 starters and 2nd/3rd for 8+
                starters. Cash ROI {row.roi}; cash+bonus value{" "}
                {row.totalPromoValue}; bonus hit rate {row.bonusHitRate}.
              </Text>
            </View>
          )) : <EmptyState />}

          <Text style={styles.subheading}>Starter count breakdown</Text>
          {insights.starterBreakdown.length ? insights.starterBreakdown.map((row) => (
            <View key={row.starters} style={styles.breakdownCard}>
              <View style={styles.breakdownHeader}>
                <View>
                  <Text style={styles.breakdownLabel}>{row.starters}</Text>
                  <Text style={styles.breakdownNote}>
                    {row.selections} · {row.totalStaked} staked ·{" "}
                    {row.cashReturned} cash · {row.bonusCredit} bonus
                  </Text>
                </View>
                <View style={styles.returnBadge}>
                  <Text style={styles.returnBadgeText}>{row.promoRoi}</Text>
                </View>
              </View>

              <View style={styles.breakdownGrid}>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.winRate}</Text>
                  <Text style={styles.breakdownMetricLabel}>Win</Text>
                </View>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.secondRate}</Text>
                  <Text style={styles.breakdownMetricLabel}>2nd</Text>
                </View>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.thirdRate}</Text>
                  <Text style={styles.breakdownMetricLabel}>3rd</Text>
                </View>
              </View>

              <View style={styles.breakdownGrid}>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.cashAverageReturn}</Text>
                  <Text style={styles.breakdownMetricLabel}>Cash avg</Text>
                </View>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.cashNetReturn}</Text>
                  <Text style={styles.breakdownMetricLabel}>Cash net</Text>
                </View>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.bonusAverageReturn}</Text>
                  <Text style={styles.breakdownMetricLabel}>Bonus avg</Text>
                </View>
                <View style={styles.breakdownMetric}>
                  <Text style={styles.breakdownMetricValue}>{row.promoAverageReturn}</Text>
                  <Text style={styles.breakdownMetricLabel}>Cash+bonus avg</Text>
                </View>
              </View>

              <Text style={styles.missingText}>
                Cash ROI {row.cashRoi}; cash+bonus value {row.totalPromoValue};
                bonus hit rate {row.bonusHitRate}; cash+bonus net {row.promoNetReturn}.
              </Text>
            </View>
          )) : <EmptyState />}

          <Text style={styles.subheading}>Favourite price breakdown</Text>
          {insights.priceBreakdown.length ? insights.priceBreakdown.map((row) => (
            <View key={row.label} style={styles.priceRow}>
              <View style={styles.priceLabelBlock}>
                <Text style={styles.priceLabel}>{row.label}</Text>
                <Text style={styles.breakdownNote}>{row.selections}</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.winRate}</Text>
                <Text style={styles.breakdownMetricLabel}>Win</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.averageReturn}</Text>
                <Text style={styles.breakdownMetricLabel}>Avg return</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.netReturn}</Text>
                <Text style={styles.breakdownMetricLabel}>Net</Text>
              </View>
            </View>
          )) : <EmptyState />}

          <Text style={styles.subheading}>Other starters avg fixed-win breakdown</Text>
          {insights.otherStartersAveragePriceBreakdown.length ? insights.otherStartersAveragePriceBreakdown.map((row) => (
            <View key={row.label} style={styles.priceRow}>
              <View style={styles.priceLabelBlock}>
                <Text style={styles.priceLabel}>{row.label}</Text>
                <Text style={styles.breakdownNote}>{row.selections}</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.winRate}</Text>
                <Text style={styles.breakdownMetricLabel}>Win</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.averageReturn}</Text>
                <Text style={styles.breakdownMetricLabel}>Avg return</Text>
              </View>
              <View style={styles.priceMetric}>
                <Text style={styles.breakdownMetricValue}>{row.netReturn}</Text>
                <Text style={styles.breakdownMetricLabel}>Net</Text>
              </View>
            </View>
          )) : <EmptyState />}
        </>
      )}
    </View>
  );
}

function isRaceCode(value: string): value is "horse" | "harness" | "greyhound" {
  return value === "horse" || value === "harness" || value === "greyhound";
}

function stripCountrySuffix(label: string, country: string) {
  return label.replace(new RegExp(`\\s\\(${country}\\)$`), "");
}

type TrackRaceOddsPanelProps = {
  canRequest: boolean;
  errorMessage: string | null;
  isLoading: boolean;
  onRequest: () => void;
  result: TrackRaceOddsResult | null;
  selectedDisciplineLabel: string;
  selectedTrackLabel: string;
};

/**
 * Shows the on-demand public odds request for races 1 and 2 at one selected track.
 */
function TrackRaceOddsPanel({
  canRequest,
  errorMessage,
  isLoading,
  onRequest,
  result,
  selectedDisciplineLabel,
  selectedTrackLabel,
}: TrackRaceOddsPanelProps) {
  return (
    <View style={styles.oddsPanel}>
      <View style={styles.oddsHeader}>
        <View style={styles.oddsHeaderText}>
          <Text style={styles.oddsTitle}>First 2 race odds</Text>
          <Text style={styles.oddsNote}>
            {selectedTrackLabel} · {selectedDisciplineLabel}
          </Text>
        </View>
        <Pressable
          disabled={!canRequest || isLoading}
          onPress={onRequest}
          style={[
            styles.oddsButton,
            (!canRequest || isLoading) ? styles.oddsButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.oddsButtonText,
              (!canRequest || isLoading) ? styles.oddsButtonTextDisabled : null,
            ]}
          >
            {isLoading ? "Checking" : "Check odds"}
          </Text>
        </Pressable>
      </View>

      {!canRequest ? (
        <Text style={styles.oddsHelp}>
          Select one discipline and keep a specific track selected to request odds.
        </Text>
      ) : errorMessage ? (
        <Text style={styles.oddsError}>{errorMessage}</Text>
      ) : result ? (
        <View style={styles.oddsResult}>
          <Text style={styles.oddsHelp}>
            {result.meetingLabel} · source date {result.sourceDate} · fetched {result.fetchedAtLabel}
          </Text>
          {result.races.length ? result.races.map((race) => (
            <View key={race.raceCardId} style={styles.oddsRace}>
              <Text style={styles.oddsRaceTitle}>
                R{race.number} · {race.name}
              </Text>
              <Text style={styles.oddsHelp}>
                {race.advertisedStart} · {race.starterCount} starters · {race.status}
              </Text>
              <Text style={styles.oddsLine}>Favourite: {race.favourite}</Text>
              <Text style={styles.oddsLine}>MarketMover: {race.marketMover}</Text>
              <View style={styles.oddsMetricGrid}>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.favouriteImplied}</Text>
                  <Text style={styles.oddsMetricLabel}>Implied win</Text>
                </View>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.candidateAverage}</Text>
                  <Text style={styles.oddsMetricLabel}>Cash+bonus avg</Text>
                  <Text style={styles.oddsMetricDetail}>{race.candidateSampleSize}</Text>
                </View>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.historicalDelta}</Text>
                  <Text style={styles.oddsMetricLabel}>Historical delta</Text>
                </View>
              </View>
              <View style={styles.oddsMetricGrid}>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.priceBucketLabel}</Text>
                  <Text style={styles.oddsMetricLabel}>Price bucket</Text>
                  <Text style={styles.oddsMetricDetail}>{race.priceBucketBonusHit}</Text>
                </View>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.starterBucketAverage}</Text>
                  <Text style={styles.oddsMetricLabel}>Starter bucket</Text>
                  <Text style={styles.oddsMetricDetail}>{race.starterBucketLabel}</Text>
                </View>
                <View style={styles.oddsMetric}>
                  <Text style={styles.oddsMetricValue}>{race.favouritePriceBucket}</Text>
                  <Text style={styles.oddsMetricLabel}>Favourite price bucket</Text>
                </View>
              </View>
              <View style={[
                styles.oddsSignal,
                race.candidateTone === "positive" ? styles.oddsSignalPositive : null,
                race.candidateTone === "caution" ? styles.oddsSignalCaution : null,
              ]}
              >
                <Text style={styles.oddsSignalLabel}>{race.candidateLabel}</Text>
                <Text style={styles.oddsSignalDetail}>{race.candidateDetail}</Text>
              </View>
              <View style={styles.runnerGrid}>
                {race.runners.map((runner) => (
                  <View key={runner.id} style={styles.runnerRow}>
                    <Text style={styles.runnerName}>
                      #{runner.number} {runner.name}
                    </Text>
                    <Text style={styles.runnerPrice}>{runner.price}</Text>
                    {runner.flags ? <Text style={styles.runnerFlags}>{runner.flags}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          )) : (
            <Text style={styles.oddsHelp}>No race-card odds were returned for races 1 and 2.</Text>
          )}
        </View>
      ) : (
        <Text style={styles.oddsHelp}>
          Request public race-card odds to compare with any account-specific promo you can see.
        </Text>
      )}
    </View>
  );
}

type FilterGroupProps = {
  label: string;
  onChange: (value: string) => void;
  options: {
    label: string;
    value: string;
  }[];
  selectedValue: string;
};

/**
 * Renders a wrapped chip group for selecting the track scope used by Insights.
 */
function FilterGroup({ label, onChange, options, selectedValue }: FilterGroupProps) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.filterRow}>
        {options.map((option) => {
          const isActive = option.value === selectedValue;

          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.filter, isActive ? styles.filterActive : null]}
            >
              <Text style={[styles.filterText, isActive ? styles.filterTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Shows a consistent empty state when a selected track has no settled favourite data.
 */
function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No settled favourite data for this track.</Text>
    </View>
  );
}

type StateMessageProps = {
  text: string;
  tone?: "default" | "error";
};

/**
 * Shows a full-width state message while Supabase Insights data loads or fails.
 */
function StateMessage({ text, tone = "default" }: StateMessageProps) {
  const isError = tone === "error";

  return (
    <View style={[styles.emptyState, isError ? styles.errorState : null]}>
      <Text style={[styles.emptyStateText, isError ? styles.errorStateText : null]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  breakdownCard: {
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  breakdownGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  breakdownHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  breakdownLabel: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  breakdownMetric: {
    flex: 1,
  },
  breakdownMetricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  breakdownMetricValue: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
  },
  breakdownNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  emptyState: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  emptyStateText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
  },
  oddsButton: {
    backgroundColor: "#18202f",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  oddsButtonDisabled: {
    backgroundColor: "#e4e7ec",
  },
  oddsButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  oddsButtonTextDisabled: {
    color: "#98a2b3",
  },
  oddsError: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 10,
  },
  oddsHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  oddsHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  oddsHelp: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  oddsLine: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 5,
  },
  oddsMetric: {
    flex: 1,
    minWidth: 92,
  },
  oddsMetricDetail: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  oddsMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  oddsMetricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  oddsMetricValue: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
  },
  oddsNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  oddsPanel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  oddsRace: {
    borderTopColor: "#e4e7ec",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  oddsRaceTitle: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  oddsResult: {
    marginTop: 4,
  },
  oddsSignal: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 10,
    padding: 9,
  },
  oddsSignalCaution: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  oddsSignalDetail: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  oddsSignalLabel: {
    color: "#18202f",
    fontSize: 12,
    fontWeight: "900",
  },
  oddsSignalPositive: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  oddsTitle: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  errorState: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  errorStateText: {
    color: "#9a3412",
  },
  filter: {
    backgroundColor: "#f8fafc",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  filterGroup: {
    marginTop: 14,
  },
  filterLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  heading: {
    color: "#18202f",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
  },
  missingText: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  priceLabel: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  priceLabelBlock: {
    flex: 1.25,
    minWidth: 110,
  },
  priceMetric: {
    flex: 1,
    minWidth: 72,
  },
  priceRow: {
    alignItems: "flex-start",
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 12,
  },
  returnBadge: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  returnBadgeText: {
    color: "#0f5f58",
    fontSize: 12,
    fontWeight: "900",
  },
  runnerFlags: {
    color: "#0f5f58",
    fontSize: 11,
    fontWeight: "900",
  },
  runnerGrid: {
    gap: 6,
    marginTop: 10,
  },
  runnerName: {
    color: "#344054",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  runnerPrice: {
    color: "#18202f",
    fontSize: 12,
    fontWeight: "900",
    minWidth: 52,
    textAlign: "right",
  },
  runnerRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e4e7ec",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  returnCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  returnDiscipline: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
  },
  returnGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  returnHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  returnMetric: {
    flex: 1,
  },
  returnMetricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  returnMetricValue: {
    color: "#18202f",
    fontSize: 16,
    fontWeight: "900",
  },
  returnNote: {
    color: "#667085",
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  stat: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 96,
    padding: 10,
  },
  statDetail: {
    color: "#667085",
    fontSize: 11,
    marginTop: 2,
  },
  statLabel: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  statValue: {
    color: "#0f766e",
    fontSize: 22,
    fontWeight: "900",
  },
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 18,
  },
  trackNote: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4,
  },
});
