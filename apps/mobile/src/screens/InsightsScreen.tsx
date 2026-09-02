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
  fetchNrlInsights,
  hasSupabaseNrlConfig,
  type NrlInsightBreakdown,
  type NrlInsightsData,
} from "../data/supabaseNrl";
import {
  fetchNpcInsights,
  hasSupabaseNpcConfig,
  type NpcInsightsData,
} from "../data/supabaseNpc";
import {
  fetchPflInsights,
  fetchUfcInsights,
  hasSupabasePflConfig,
  hasSupabaseUfcConfig,
  type UfcInsightsData,
} from "../data/supabaseUfc";
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
  placeStats: [],
  priceBreakdown: [],
  starterBreakdown: [],
};

type InsightMode = "win" | "place";
type InsightSport = "npc" | "pfl" | "racing" | "nrl" | "ufc";

const emptyUfcInsights: UfcInsightsData = {
  favouritePriceBreakdown: [],
  otherFighterPriceBreakdown: [],
  priceDifferenceBreakdown: [],
  summaryStats: [],
};

const emptyNrlInsights: NrlInsightsData = {
  fixedWinOtherTeamPriceBreakdown: [],
  fixedWinPriceDifferenceBreakdown: [],
  fixedWinPriceBreakdown: [],
  fixedWinRoundBreakdown: [],
  fixedWinSelectionBreakdown: [],
  fixedWinSummaryStats: [],
  sameGameRoundBreakdown: [],
  sameGameSummaryStats: [],
  tryScorerPlayerBreakdown: [],
  tryScorerPriceBreakdown: [],
  tryScorerSummaryStats: [],
  tryScorerTeamBreakdown: [],
};

/**
 * Shows sport-specific favourite-performance insights.
 */
export function InsightsScreen() {
  const [sport, setSport] = useState<InsightSport>("racing");
  const [filters, setFilters] = useState<InsightFilters>({
    country: "all",
    course: "all",
    discipline: "all",
  });
  const [metadata, setMetadata] = useState<InsightMetadata | null>(null);
  const [insights, setInsights] = useState<InsightsData>(emptyInsights);
  const [nrlInsights, setNrlInsights] = useState<NrlInsightsData>(emptyNrlInsights);
  const [npcInsights, setNpcInsights] = useState<NpcInsightsData>(emptyNrlInsights);
  const [ufcInsights, setUfcInsights] = useState<UfcInsightsData>(emptyUfcInsights);
  const [oddsErrorMessage, setOddsErrorMessage] = useState<string | null>(null);
  const [oddsResult, setOddsResult] = useState<TrackRaceOddsResult | null>(null);
  const [insightMode, setInsightMode] = useState<InsightMode>("win");
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isLoadingNrlInsights, setIsLoadingNrlInsights] = useState(false);
  const [isLoadingNpcInsights, setIsLoadingNpcInsights] = useState(false);
  const [isLoadingUfcInsights, setIsLoadingUfcInsights] = useState(false);
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
    || insights.placeStats.length > 0
    || insights.starterBreakdown.length > 0
    || insights.priceBreakdown.length > 0
    || insights.otherStartersAveragePriceBreakdown.length > 0;
  const hasUfcInsightRows = ufcInsights.summaryStats.length > 0
    || ufcInsights.favouritePriceBreakdown.length > 0
    || ufcInsights.otherFighterPriceBreakdown.length > 0
    || ufcInsights.priceDifferenceBreakdown.length > 0;
  const hasNrlInsightRows = nrlInsights.fixedWinSummaryStats.length > 0
    || nrlInsights.fixedWinSelectionBreakdown.length > 0
    || nrlInsights.fixedWinPriceBreakdown.length > 0
    || nrlInsights.fixedWinRoundBreakdown.length > 0
    || nrlInsights.sameGameSummaryStats.length > 0
    || nrlInsights.sameGameRoundBreakdown.length > 0
    || nrlInsights.tryScorerSummaryStats.length > 0
    || nrlInsights.tryScorerPlayerBreakdown.length > 0
    || nrlInsights.tryScorerPriceBreakdown.length > 0
    || nrlInsights.tryScorerTeamBreakdown.length > 0;
  const hasNpcInsightRows = npcInsights.fixedWinSummaryStats.length > 0
    || npcInsights.fixedWinSelectionBreakdown.length > 0
    || npcInsights.fixedWinPriceBreakdown.length > 0
    || npcInsights.fixedWinRoundBreakdown.length > 0
    || npcInsights.sameGameSummaryStats.length > 0
    || npcInsights.sameGameRoundBreakdown.length > 0
    || npcInsights.tryScorerSummaryStats.length > 0
    || npcInsights.tryScorerPlayerBreakdown.length > 0
    || npcInsights.tryScorerPriceBreakdown.length > 0
    || npcInsights.tryScorerTeamBreakdown.length > 0;

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
      if (sport !== "racing" || !metadata) {
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
  }, [filters, metadata, sport]);

  useEffect(() => {
    let cancelled = false;

    async function loadNrlInsights() {
      if (sport !== "nrl") {
        return;
      }

      if (!hasSupabaseNrlConfig) {
        setErrorMessage("Supabase is not configured for NRL Insights.");
        return;
      }

      try {
        setIsLoadingNrlInsights(true);
        setErrorMessage(null);
        const nextInsights = await fetchNrlInsights();

        if (!cancelled) {
          setNrlInsights(nextInsights);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "NRL Insights failed to load.");
          setNrlInsights(emptyNrlInsights);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingNrlInsights(false);
        }
      }
    }

    loadNrlInsights();

    return () => {
      cancelled = true;
    };
  }, [sport]);

  useEffect(() => {
    let cancelled = false;

    async function loadNpcInsights() {
      if (sport !== "npc") {
        return;
      }

      if (!hasSupabaseNpcConfig) {
        setErrorMessage("Supabase is not configured for NPC Insights.");
        return;
      }

      try {
        setIsLoadingNpcInsights(true);
        setErrorMessage(null);
        const nextInsights = await fetchNpcInsights();

        if (!cancelled) {
          setNpcInsights(nextInsights);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "NPC Insights failed to load.");
          setNpcInsights(emptyNrlInsights);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingNpcInsights(false);
        }
      }
    }

    loadNpcInsights();

    return () => {
      cancelled = true;
    };
  }, [sport]);

  useEffect(() => {
    let cancelled = false;

    async function loadUfcInsights() {
      if (sport !== "pfl" && sport !== "ufc") {
        return;
      }

      const sportLabel = sport === "pfl" ? "PFL" : "UFC";
      const hasConfig = sport === "pfl" ? hasSupabasePflConfig : hasSupabaseUfcConfig;

      if (!hasConfig) {
        setErrorMessage(`Supabase is not configured for ${sportLabel} Insights.`);
        return;
      }

      try {
        setIsLoadingUfcInsights(true);
        setErrorMessage(null);
        const nextInsights = sport === "pfl"
          ? await fetchPflInsights()
          : await fetchUfcInsights();

        if (!cancelled) {
          setUfcInsights(nextInsights);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : `${sportLabel} Insights failed to load.`);
          setUfcInsights(emptyUfcInsights);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUfcInsights(false);
        }
      }
    }

    loadUfcInsights();

    return () => {
      cancelled = true;
    };
  }, [sport]);

  function updateSport(value: string) {
    if (value === "npc" || value === "pfl" || value === "racing" || value === "nrl" || value === "ufc") {
      setSport(value);
      setOddsResult(null);
      setOddsErrorMessage(null);
      setErrorMessage(null);
    }
  }

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
   * Requests public odds for every race at the selected track and discipline.
   */
  async function checkTrackRaceOdds() {
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
        {sport === "ufc"
          ? "Showing UFC favourite price, other fighter price, and price-difference signals"
          : sport === "pfl"
            ? "Showing PFL favourite price, other fighter price, and price-difference signals"
          : sport === "npc"
            ? "Showing NPC fixed-win favourite signals"
          : sport === "nrl"
            ? "Showing NRL fixed-win favourite and try-scorer percentage signals"
          : `Showing ${selectedCountryLabel} · ${selectedTrackLabel} · ${selectedDisciplineLabel}`}
      </Text>

      <FilterGroup
        label="Sport"
        onChange={updateSport}
        options={[
          { label: "Racing", value: "racing" },
          { label: "NRL", value: "nrl" },
          { label: "NPC", value: "npc" },
          { label: "PFL", value: "pfl" },
          { label: "UFC", value: "ufc" },
        ]}
        selectedValue={sport}
      />

      {sport === "racing" ? (
        <>
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

          <InsightModeTabs selectedValue={insightMode} onChange={setInsightMode} />

          <FavouriteTrackControl onChange={refreshFavouriteFilters} track={favouriteTrack} />
        </>
      ) : null}

      {sport === "racing" && filters.course !== "all" ? (
        <TrackRaceOddsPanel
          canRequest={canRequestTrackOdds}
          errorMessage={oddsErrorMessage}
          isLoading={isRequestingOdds}
          onRequest={checkTrackRaceOdds}
          result={oddsResult}
          selectedDisciplineLabel={selectedDisciplineLabel}
          selectedTrackLabel={selectedTrackLabel}
        />
      ) : null}

      {sport === "nrl" ? (
        errorMessage ? (
          <StateMessage tone="error" text={errorMessage} />
        ) : isLoadingNrlInsights ? (
          <StateMessage text="Loading stored NRL insight aggregates from Supabase." />
        ) : !hasNrlInsightRows ? (
          <StateMessage text="No stored NRL insight aggregates are loaded yet." />
        ) : (
          <NrlInsightsPanel insights={nrlInsights} />
        )
      ) : sport === "npc" ? (
        errorMessage ? (
          <StateMessage tone="error" text={errorMessage} />
        ) : isLoadingNpcInsights ? (
          <StateMessage text="Loading stored NPC insight aggregates from Supabase." />
        ) : !hasNpcInsightRows ? (
          <StateMessage text="No stored NPC insight aggregates are loaded yet." />
        ) : (
          <NrlInsightsPanel insights={npcInsights} />
        )
      ) : sport === "pfl" || sport === "ufc" ? (
        errorMessage ? (
          <StateMessage tone="error" text={errorMessage} />
        ) : isLoadingUfcInsights ? (
          <StateMessage text={`Loading stored ${sport === "pfl" ? "PFL" : "UFC"} insight aggregates from Supabase.`} />
        ) : !hasUfcInsightRows ? (
          <StateMessage text={`No stored ${sport === "pfl" ? "PFL" : "UFC"} insight aggregates are loaded yet.`} />
        ) : (
          <UfcInsightsPanel insights={ufcInsights} sportLabel={sport === "pfl" ? "PFL" : "UFC"} />
        )
      ) : errorMessage ? (
        <StateMessage tone="error" text={errorMessage} />
      ) : isLoadingMetadata || isLoadingInsights ? (
        <StateMessage text="Loading stored insight aggregates from Supabase." />
      ) : !hasInsightRows ? (
        <StateMessage text="No stored insight aggregates match this scope." />
      ) : (
        insightMode === "win"
          ? <WinInsightsPanel insights={insights} />
          : <PlaceInsightsPanel insights={insights} />
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

type InsightModeTabsProps = {
  onChange: (value: InsightMode) => void;
  selectedValue: InsightMode;
};

/**
 * Switches Insights between win-return and place-return statistics.
 */
function InsightModeTabs({ onChange, selectedValue }: InsightModeTabsProps) {
  const options: { label: string; value: InsightMode }[] = [
    { label: "Win", value: "win" },
    { label: "Place", value: "place" },
  ];

  return (
    <View style={styles.modeTabs}>
      {options.map((option) => {
        const isActive = option.value === selectedValue;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.modeTab, isActive ? styles.modeTabActive : null]}
          >
            <Text style={[styles.modeTabText, isActive ? styles.modeTabTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type InsightsPanelProps = {
  insights: InsightsData;
};

type NrlInsightsPanelProps = {
  insights: NrlInsightsData;
};

type UfcInsightsPanelProps = {
  insights: UfcInsightsData;
  sportLabel: "PFL" | "UFC";
};

/**
 * Shows NRL Same Game percentage first, followed by singles breakdowns.
 */
function NrlInsightsPanel({ insights }: NrlInsightsPanelProps) {
  const hasSameGameRows = insights.sameGameSummaryStats.length > 0
    || insights.sameGameRoundBreakdown.length > 0;

  return (
    <>
      {hasSameGameRows ? (
        <>
          <Text style={styles.subheading}>Same game percentage</Text>
          <View style={styles.statsRow}>
            {insights.sameGameSummaryStats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statDetail}>{stat.detail}</Text>
              </View>
            ))}
          </View>

          <NrlBreakdown title="Same game by round" rows={insights.sameGameRoundBreakdown} />
        </>
      ) : null}

      <Text style={styles.subheading}>Fixed win singles</Text>
      <View style={styles.statsRow}>
        {insights.fixedWinSummaryStats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>

      <NrlBreakdown title="Fixed win by selection" rows={insights.fixedWinSelectionBreakdown} />
      <NrlBreakdown title="Fixed win price breakdown" rows={insights.fixedWinPriceBreakdown} />
      <NrlBreakdown title="Fixed win other team price breakdown" rows={insights.fixedWinOtherTeamPriceBreakdown} />
      <NrlBreakdown title="Fixed win price difference breakdown" rows={insights.fixedWinPriceDifferenceBreakdown} />
      <NrlBreakdown title="Fixed win by round" rows={insights.fixedWinRoundBreakdown} />

      <Text style={styles.subheading}>Try scorer percentage</Text>
      <View style={styles.statsRow}>
        {insights.tryScorerSummaryStats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>

      <NrlBreakdown title="Try scorer price breakdown" rows={insights.tryScorerPriceBreakdown} />
      <NrlBreakdown title="Try scorer by player" rows={insights.tryScorerPlayerBreakdown} />
      <NrlBreakdown title="Try scorer by team" rows={insights.tryScorerTeamBreakdown} />
    </>
  );
}

type NrlBreakdownProps = {
  rows: NrlInsightBreakdown[];
  title: string;
};

/**
 * Shows one NRL aggregate breakdown list using the shared insight row layout.
 */
function NrlBreakdown({ rows, title }: NrlBreakdownProps) {
  return (
    <>
      <Text style={styles.subheading}>{title}</Text>
      {rows.length ? rows.map((row) => (
        <View key={`${title}-${row.label}`} style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <View>
              <Text style={styles.breakdownLabel}>{row.label}</Text>
              <Text style={styles.breakdownNote}>
                {row.selections} · {row.detail} · {row.pending}
              </Text>
            </View>
            <View style={styles.returnBadge}>
              <Text style={styles.returnBadgeText}>{row.winRate}</Text>
            </View>
          </View>

          <View style={styles.breakdownGrid}>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.averageReturn}</Text>
              <Text style={styles.breakdownMetricLabel}>Avg return</Text>
            </View>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.netReturn}</Text>
              <Text style={styles.breakdownMetricLabel}>Net</Text>
            </View>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.roi}</Text>
              <Text style={styles.breakdownMetricLabel}>ROI</Text>
            </View>
          </View>
        </View>
      )) : <EmptyState />}
    </>
  );
}

/**
 * Shows fight-sport win-return statistics and price-shape breakdowns.
 */
function UfcInsightsPanel({ insights, sportLabel }: UfcInsightsPanelProps) {
  return (
    <>
      <View style={styles.statsRow}>
        {insights.summaryStats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>

      <WinPriceBreakdown title={`${sportLabel} favourite price breakdown`} rows={insights.favouritePriceBreakdown} />
      <WinPriceBreakdown title={`${sportLabel} other fighter price breakdown`} rows={insights.otherFighterPriceBreakdown} />
      <WinPriceBreakdown title={`${sportLabel} price difference breakdown`} rows={insights.priceDifferenceBreakdown} />
    </>
  );
}

/**
 * Shows the existing win-focused Insights statistics.
 */
function WinInsightsPanel({ insights }: InsightsPanelProps) {
  return (
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

      <WinPriceBreakdown title="Favourite price breakdown" rows={insights.priceBreakdown} />
      <WinPriceBreakdown
        title="Other starters avg fixed-win breakdown"
        rows={insights.otherStartersAveragePriceBreakdown}
      />
    </>
  );
}

type WinPriceBreakdownProps = {
  rows: InsightsData["priceBreakdown"];
  title: string;
};

/**
 * Shows win-rate and win-return metrics for price bucket rows.
 */
function WinPriceBreakdown({ rows, title }: WinPriceBreakdownProps) {
  return (
    <>
      <Text style={styles.subheading}>{title}</Text>
      {rows.length ? rows.map((row) => (
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
  );
}

/**
 * Shows place-focused Insights statistics without bonus-bet value.
 */
function PlaceInsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <>
      <View style={styles.statsRow}>
        {insights.placeStats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subheading}>$1 favourite place return by discipline</Text>
      {insights.disciplineReturns.length ? insights.disciplineReturns.map((row) => (
        <View key={`place-${row.discipline}`} style={styles.returnCard}>
          <View style={styles.returnHeader}>
            <View>
              <Text style={styles.returnDiscipline}>{row.discipline}</Text>
              <Text style={styles.returnNote}>
                {row.placeTotalStaked} staked · {row.placeTotalReturned} cash ·{" "}
                {row.placeSelections}
              </Text>
            </View>
            <View style={styles.returnBadge}>
              <Text style={styles.returnBadgeText}>{row.placeHitRate}</Text>
            </View>
          </View>

          <View style={styles.returnGrid}>
            <View style={styles.returnMetric}>
              <Text style={styles.returnMetricValue}>{row.placeAverageReturn}</Text>
              <Text style={styles.returnMetricLabel}>Cash avg</Text>
            </View>
            <View style={styles.returnMetric}>
              <Text style={styles.returnMetricValue}>{row.placeNetReturn}</Text>
              <Text style={styles.returnMetricLabel}>Cash net</Text>
            </View>
            <View style={styles.returnMetric}>
              <Text style={styles.returnMetricValue}>{row.placeRoi}</Text>
              <Text style={styles.returnMetricLabel}>Cash ROI</Text>
            </View>
          </View>

          <Text style={styles.missingText}>
            Place returns use paid place-market dividends only. AU/NZ fields
            count 5-7 starters for top 2 and 8+ for top 3; HK fields count
            4-6 starters for top 2 and 7+ for top 3.
            {row.missingPlaceReturns > 0
              ? ` ${row.missingPlaceReturns} placed favourites are missing place dividends.`
              : ""}
          </Text>
        </View>
      )) : <EmptyState />}

      <Text style={styles.subheading}>Starter count breakdown</Text>
      {insights.starterBreakdown.length ? insights.starterBreakdown.map((row) => (
        <View key={`place-${row.starters}`} style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <View>
              <Text style={styles.breakdownLabel}>{row.starters}</Text>
              <Text style={styles.breakdownNote}>
                {row.placeSelections} · {row.placeTotalStaked} staked ·{" "}
                {row.placeTotalReturned} cash
              </Text>
            </View>
            <View style={styles.returnBadge}>
              <Text style={styles.returnBadgeText}>{row.placeHitRate}</Text>
            </View>
          </View>

          <View style={styles.breakdownGrid}>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.placeHitRate}</Text>
              <Text style={styles.breakdownMetricLabel}>Place</Text>
            </View>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.placeAverageReturn}</Text>
              <Text style={styles.breakdownMetricLabel}>Cash avg</Text>
            </View>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.placeNetReturn}</Text>
              <Text style={styles.breakdownMetricLabel}>Cash net</Text>
            </View>
            <View style={styles.breakdownMetric}>
              <Text style={styles.breakdownMetricValue}>{row.placeRoi}</Text>
              <Text style={styles.breakdownMetricLabel}>Cash ROI</Text>
            </View>
          </View>

          {row.missingPlaceReturns > 0 ? (
            <Text style={styles.missingText}>
              {row.missingPlaceReturns} placed favourites are missing place dividends.
            </Text>
          ) : null}
        </View>
      )) : <EmptyState />}

      <PlacePriceBreakdown rows={insights.priceBreakdown} />
    </>
  );
}

type PlacePriceBreakdownProps = {
  rows: InsightsData["priceBreakdown"];
};

/**
 * Shows place-rate and place-return metrics for favourite price bucket rows.
 */
function PlacePriceBreakdown({ rows }: PlacePriceBreakdownProps) {
  return (
    <>
      <Text style={styles.subheading}>Favourite price breakdown</Text>
      {rows.length ? rows.map((row) => (
        <View key={`place-${row.label}`} style={styles.priceRow}>
          <View style={styles.priceLabelBlock}>
            <Text style={styles.priceLabel}>{row.label}</Text>
            <Text style={styles.breakdownNote}>{row.placeSelections}</Text>
          </View>
          <View style={styles.priceMetric}>
            <Text style={styles.breakdownMetricValue}>{row.placeHitRate}</Text>
            <Text style={styles.breakdownMetricLabel}>Place</Text>
          </View>
          <View style={styles.priceMetric}>
            <Text style={styles.breakdownMetricValue}>{row.placeAverageReturn}</Text>
            <Text style={styles.breakdownMetricLabel}>Cash avg</Text>
          </View>
          <View style={styles.priceMetric}>
            <Text style={styles.breakdownMetricValue}>{row.placeNetReturn}</Text>
            <Text style={styles.breakdownMetricLabel}>Cash net</Text>
          </View>
        </View>
      )) : <EmptyState />}
    </>
  );
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
 * Shows the on-demand public odds request for every race at one selected track.
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
          <Text style={styles.oddsTitle}>Track race odds</Text>
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
                  <Text style={styles.oddsMetricValue}>{race.candidateCashAverageScore}</Text>
                  <Text style={styles.oddsMetricLabel}>Cash avg score</Text>
                  <Text style={styles.oddsMetricDetail}>{race.candidateModelLabel}</Text>
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
            <Text style={styles.oddsHelp}>No race-card odds were returned for this track.</Text>
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
  modeTab: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modeTabActive: {
    backgroundColor: "#18202f",
  },
  modeTabText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  modeTabTextActive: {
    color: "#ffffff",
  },
  modeTabs: {
    backgroundColor: "#f2f4f7",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginTop: 14,
    padding: 4,
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
