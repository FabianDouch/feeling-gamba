import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DateRangeFilter } from "../components/DateRangeFilter";
import {
  createDefaultRaceDayFilters,
  DEFAULT_RACE_DAY_ROW_LIMIT,
  fetchRaceDayEntries,
  fetchRaceDayMetadata,
  getCourseOptions,
  hasSupabaseRaceDayConfig,
  type RaceDayFilters,
  type RaceDayMetadata,
} from "../data/supabaseRaceDays";
import {
  fetchHistoricalMultiBacktestPerformance,
  hasSupabaseHistoricalBacktestConfig,
  type HistoricalBacktestRankFilter,
} from "../data/supabaseHistoricalBacktests";
import {
  PLACING_PERCENTAGE_MULTI_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  type WinPercentageMultiModelKey,
} from "../data/supabasePredictions";
import {
  createDefaultUfcHistoricalFilters,
  DEFAULT_UFC_ROW_LIMIT,
  fetchPflHistoricalEntries,
  fetchPflHistoricalMetadata,
  fetchUfcHistoricalEntries,
  fetchUfcHistoricalMetadata,
  hasSupabasePflConfig,
  hasSupabaseUfcConfig,
  type UfcFightSummary,
  type UfcHistoricalFilters,
  type UfcHistoricalMetadata,
} from "../data/supabaseUfc";
import type { FavouriteStat, RaceSummary } from "../data/collectedRaceDay";
import { FavouriteTrackControl } from "./FavouriteTrackControl";
import { FavouriteTrackQuickFilter } from "./FavouriteTrackQuickFilter";
import { WinPercentageMultiModelTabs } from "./PredictionControls";
import type { UserFavouriteTrack } from "../data/userFavouriteTracks";

type HistoricalSport = "pfl" | "racing" | "ufc";
type HistoricalView = "backtests" | "rows";
type HistoricalBacktestHistoryType = "win_percentage_multis";

const HISTORICAL_BACKTEST_HISTORY_TYPE_OPTIONS = [
  { label: "Win % multis", value: "win_percentage_multis" },
] satisfies { label: string; value: HistoricalBacktestHistoryType }[];
const HISTORICAL_BACKTEST_RANK_OPTIONS = [
  { label: "All legs", value: "all" },
  { label: "Top 2", value: "2" },
  { label: "Top 3", value: "3" },
  { label: "Top 4", value: "4" },
] satisfies { label: string; value: HistoricalBacktestRankFilter }[];

/**
 * Lists sport-specific historical rows with source-backed prices and results.
 */
export function RaceDaysScreen() {
  const [sport, setSport] = useState<HistoricalSport>("racing");
  const [view, setView] = useState<HistoricalView>("rows");
  const [filters, setFilters] = useState<RaceDayFilters>({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  });
  const [ufcFilters, setUfcFilters] = useState<UfcHistoricalFilters>({
    fromDate: "",
    toDate: "",
  });
  const [metadata, setMetadata] = useState<RaceDayMetadata | null>(null);
  const [ufcMetadata, setUfcMetadata] = useState<UfcHistoricalMetadata | null>(null);
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [ufcFights, setUfcFights] = useState<UfcFightSummary[]>([]);
  const [backtestPerformanceStats, setBacktestPerformanceStats] = useState<FavouriteStat[]>([]);
  const [backtestHistoryType, setBacktestHistoryType] =
    useState<HistoricalBacktestHistoryType>("win_percentage_multis");
  const [activeBacktestModelKey, setActiveBacktestModelKey] =
    useState<WinPercentageMultiModelKey>(WIN_PERCENTAGE_MULTI_MODEL_KEY);
  const [backtestRankFilter, setBacktestRankFilter] =
    useState<HistoricalBacktestRankFilter>("all");
  const [totalRaceCount, setTotalRaceCount] = useState(0);
  const [totalUfcFightCount, setTotalUfcFightCount] = useState(0);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingUfcMetadata, setIsLoadingUfcMetadata] = useState(false);
  const [isLoadingRaces, setIsLoadingRaces] = useState(false);
  const [isLoadingUfcFights, setIsLoadingUfcFights] = useState(false);
  const [isLoadingBacktestPerformance, setIsLoadingBacktestPerformance] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favouritesReloadKey, setFavouritesReloadKey] = useState(0);
  const courseOptions = useMemo(() => getCourseOptions(metadata, filters.country), [
    filters.country,
    metadata,
  ]);
  const selectedCourseLabel = courseOptions.find((option) => option.value === filters.course)
    ?.label ?? "";
  const favouriteTrack = isConcreteFavouriteTrack(filters, selectedCourseLabel)
    ? {
        country: filters.country,
        courseName: selectedCourseLabel,
        courseSlug: filters.course,
        raceCode: filters.discipline,
      }
    : null;
  const filterKey = `${filters.fromDate}-${filters.toDate}-${filters.country}-${filters.discipline}-${filters.course}`;
  const ufcFilterKey = `${ufcFilters.fromDate}-${ufcFilters.toDate}`;
  const isFightSport = sport === "pfl" || sport === "ufc";
  const fightSportLabel = sport === "pfl" ? "PFL" : "UFC";

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!hasSupabaseRaceDayConfig) {
        setErrorMessage("Supabase is not configured for Race Days.");
        setIsLoadingMetadata(false);
        return;
      }

      try {
        setIsLoadingMetadata(true);
        setErrorMessage(null);
        const nextMetadata = await fetchRaceDayMetadata();

        if (cancelled) {
          return;
        }

        setMetadata(nextMetadata);
        setFilters(createDefaultRaceDayFilters(nextMetadata));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Race Days metadata failed to load.");
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
    setActiveBacktestModelKey(sport === "ufc"
      ? UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY
      : WIN_PERCENTAGE_MULTI_MODEL_KEY);
    setBacktestRankFilter("all");
  }, [sport]);

  useEffect(() => {
    let cancelled = false;

    async function loadUfcMetadata() {
      if (!isFightSport || ufcMetadata) {
        return;
      }

      const hasConfig = sport === "pfl" ? hasSupabasePflConfig : hasSupabaseUfcConfig;

      if (!hasConfig) {
        setErrorMessage(`Supabase is not configured for ${fightSportLabel} Historical Data.`);
        setIsLoadingUfcMetadata(false);
        return;
      }

      try {
        setIsLoadingUfcMetadata(true);
        setErrorMessage(null);
        const nextMetadata = sport === "pfl"
          ? await fetchPflHistoricalMetadata()
          : await fetchUfcHistoricalMetadata();

        if (cancelled) {
          return;
        }

        setUfcMetadata(nextMetadata);
        setUfcFilters(createDefaultUfcHistoricalFilters(nextMetadata));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : `${fightSportLabel} Historical Data metadata failed to load.`);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUfcMetadata(false);
        }
      }
    }

    loadUfcMetadata();

    return () => {
      cancelled = true;
    };
  }, [fightSportLabel, isFightSport, sport, ufcMetadata]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaces() {
      if (sport !== "racing" || view !== "rows" || !metadata || !filters.fromDate || !filters.toDate) {
        return;
      }

      try {
        setIsLoadingRaces(true);
        setErrorMessage(null);
        const result = await fetchRaceDayEntries(filters, {
          limit: isDefaultRaceDayView(filters, metadata) ? DEFAULT_RACE_DAY_ROW_LIMIT : undefined,
        });

        if (cancelled) {
          return;
        }

        setRaces(result.races);
        setTotalRaceCount(result.totalCount);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Race Days failed to load.");
          setRaces([]);
          setTotalRaceCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRaces(false);
        }
      }
    }

    loadRaces();

    return () => {
      cancelled = true;
    };
  }, [filters, metadata, sport, view]);

  useEffect(() => {
    let cancelled = false;

    async function loadUfcFights() {
      if (!isFightSport || view !== "rows" || !ufcMetadata || !ufcFilters.fromDate || !ufcFilters.toDate) {
        return;
      }

      try {
        setIsLoadingUfcFights(true);
        setErrorMessage(null);
        const fetchEntries = sport === "pfl" ? fetchPflHistoricalEntries : fetchUfcHistoricalEntries;
        const result = await fetchEntries(ufcFilters, {
          limit: isDefaultUfcView(ufcFilters, ufcMetadata) ? DEFAULT_UFC_ROW_LIMIT : undefined,
        });

        if (cancelled) {
          return;
        }

        setUfcFights(result.fights);
        setTotalUfcFightCount(result.totalCount);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : `${fightSportLabel} Historical Data failed to load.`);
          setUfcFights([]);
          setTotalUfcFightCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUfcFights(false);
        }
      }
    }

    loadUfcFights();

    return () => {
      cancelled = true;
    };
  }, [fightSportLabel, isFightSport, sport, ufcFilters, ufcMetadata, view]);

  useEffect(() => {
    let cancelled = false;

    async function loadBacktestPerformance() {
      if (view !== "backtests" || sport === "pfl") {
        return;
      }

      if (!hasSupabaseHistoricalBacktestConfig) {
        setErrorMessage("Supabase is not configured for Historical backtests.");
        return;
      }

      try {
        setIsLoadingBacktestPerformance(true);
        setErrorMessage(null);
        const stats = await fetchHistoricalMultiBacktestPerformance(
          sport,
          activeBacktestModelKey,
          backtestRankFilter,
        );

        if (cancelled) {
          return;
        }

        setBacktestPerformanceStats(stats);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Historical backtests failed to load.");
          setBacktestPerformanceStats([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBacktestPerformance(false);
        }
      }
    }

    loadBacktestPerformance();

    return () => {
      cancelled = true;
    };
  }, [activeBacktestModelKey, backtestRankFilter, sport, view]);

  function updateFilter(key: keyof RaceDayFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateSport(value: string) {
    if (value === "pfl" || value === "racing" || value === "ufc") {
      if ((value === "pfl" || value === "ufc") && value !== sport) {
        setUfcMetadata(null);
        setUfcFilters({ fromDate: "", toDate: "" });
        setUfcFights([]);
        setTotalUfcFightCount(0);
      }
      setSport(value);
      if (value === "pfl") {
        setView("rows");
      }
      setErrorMessage(null);
    }
  }

  /**
   * Applies a country filter and clears the selected course to avoid cross-country mismatches.
   */
  function updateCountry(value: string) {
    setFilters((current) => ({
      ...current,
      country: value,
      course: "all",
    }));
  }

  function updateDateBoundary(key: "fromDate" | "toDate", value: string) {
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (next.fromDate > next.toDate) {
        return key === "fromDate"
          ? { ...next, toDate: value }
          : { ...next, fromDate: value };
      }

      return next;
    });
  }

  function resetDateRange() {
    if (!metadata) {
      return;
    }

    setFilters((current) => ({
      ...current,
      fromDate: metadata.defaultDateRange.from,
      toDate: metadata.defaultDateRange.to,
    }));
  }

  function updateUfcDateBoundary(key: "fromDate" | "toDate", value: string) {
    setUfcFilters((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (next.fromDate > next.toDate) {
        return key === "fromDate"
          ? { ...next, toDate: value }
          : { ...next, fromDate: value };
      }

      return next;
    });
  }

  function resetUfcDateRange() {
    if (!ufcMetadata) {
      return;
    }

    setUfcFilters({
      fromDate: ufcMetadata.defaultDateRange.from,
      toDate: ufcMetadata.defaultDateRange.to,
    });
  }

  /**
   * Applies a saved track shortcut while preserving the selected Race Days date range.
   */
  function applyFavouriteTrack(track: UserFavouriteTrack) {
    setFilters((current) => ({
      ...current,
      country: track.country,
      course: track.courseSlug,
      discipline: track.raceCode,
    }));
  }

  function refreshFavouriteFilters() {
    setFavouritesReloadKey((current) => current + 1);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Historical data</Text>
          <Text style={styles.heading}>
            {view === "backtests"
              ? "Historical model backtests"
              : isFightSport ? `Logged ${fightSportLabel} fights` : "Logged races"}
          </Text>
          <Text style={styles.countText}>
            {view === "backtests"
              ? isLoadingBacktestPerformance
                ? "Loading historical model performance"
                : backtestPerformanceStats.length
                  ? "All-time model backtest performance"
                  : "No historical model performance"
              : isFightSport
              ? isLoadingUfcMetadata || isLoadingUfcFights
                ? `Loading Supabase ${fightSportLabel} fights`
                : `${ufcFights.length} of ${totalUfcFightCount} fights`
              : isLoadingMetadata || isLoadingRaces
              ? "Loading Supabase races"
              : `${races.length} of ${totalRaceCount} races`}
          </Text>
        </View>
        <Text style={styles.datePill}>
          {isFightSport
            ? ufcMetadata?.latestWindowLabel ?? "Supabase"
            : metadata?.latestWindowLabel ?? "Supabase"}
        </Text>
      </View>

      <FilterGroup
        label="Sport"
        options={[
          { label: "Racing", value: "racing" },
          { label: "PFL", value: "pfl" },
          { label: "UFC", value: "ufc" },
        ]}
        selectedValue={sport}
        onChange={updateSport}
      />
      {sport === "pfl" ? null : (
        <FilterGroup
          label="View"
          options={[
            { label: "Historical rows", value: "rows" },
            { label: "Model backtests", value: "backtests" },
          ]}
          selectedValue={view}
          onChange={(value) => setView(value as HistoricalView)}
        />
      )}

      {isFightSport ? (
        <>
          {view === "backtests" ? (
            <HistoricalBacktestPerformancePanel
              activeHistoryType={backtestHistoryType}
              activeModelKey={activeBacktestModelKey}
              errorMessage={errorMessage}
              isLoading={isLoadingBacktestPerformance}
              onChangeHistoryType={(value) => setBacktestHistoryType(value)}
              onChangeModel={setActiveBacktestModelKey}
              onChangeRank={(value) => setBacktestRankFilter(value)}
              rankFilter={backtestRankFilter}
              sport={sport}
              stats={backtestPerformanceStats}
            />
          ) : (
            <>
              <DateRangeFilter
                availableLabel={`available ${fightSportLabel} event dates`}
                fromDate={ufcFilters.fromDate}
                onChange={updateUfcDateBoundary}
                onReset={resetUfcDateRange}
                options={ufcMetadata?.dateOptions ?? []}
                toDate={ufcFilters.toDate}
                windowLabel={ufcMetadata?.latestWindowRangeLabel ?? `Loading available ${fightSportLabel} dates`}
              />

              <View key={ufcFilterKey}>
                {errorMessage ? (
                  <View style={styles.errorState}>
                    <Text style={styles.errorStateText}>{errorMessage}</Text>
                  </View>
                ) : isLoadingUfcMetadata || isLoadingUfcFights ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>Loading {fightSportLabel} fights from Supabase.</Text>
                  </View>
                ) : ufcFights.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No {fightSportLabel} fights match this date range.</Text>
                  </View>
                ) : ufcFights.map((fight) => (
                  <View key={fight.fightId} style={styles.raceRow}>
                    <View style={styles.raceNumber}>
                      <Text style={styles.raceNumberText}>{fightSportLabel}</Text>
                    </View>
                    <View style={styles.raceContent}>
                      <Text style={styles.raceTitle}>
                        {fight.eventDateLabel} · {fight.fighters}
                      </Text>
                      <Text style={styles.raceMeta}>
                        Winner: {fight.winner} · {fight.priceSource}
                      </Text>
                      <Text style={styles.raceMeta}>
                        Fav: {fight.favourite} ({fight.favouritePrice}) · Other {fight.otherFighterPrice} · Diff {fight.priceDifference}
                      </Text>
                    </View>
                    <View style={styles.resultBlock}>
                      <Text style={styles.result}>{fight.result}</Text>
                      <Text style={styles.payout}>{fight.payout}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      ) : (
        <>
          {view === "backtests" ? (
            <HistoricalBacktestPerformancePanel
              activeHistoryType={backtestHistoryType}
              activeModelKey={activeBacktestModelKey}
              errorMessage={errorMessage}
              isLoading={isLoadingBacktestPerformance}
              onChangeHistoryType={(value) => setBacktestHistoryType(value)}
              onChangeModel={setActiveBacktestModelKey}
              onChangeRank={(value) => setBacktestRankFilter(value)}
              rankFilter={backtestRankFilter}
              sport={sport}
              stats={backtestPerformanceStats}
            />
          ) : (
            <>
              <DateRangeFilter
                availableLabel="available race dates"
                fromDate={filters.fromDate}
                onChange={updateDateBoundary}
                onReset={resetDateRange}
                options={metadata?.dateOptions ?? []}
                toDate={filters.toDate}
                windowLabel={metadata?.latestWindowRangeLabel ?? "Loading available race dates"}
              />
              <FavouriteTrackQuickFilter
                activeTrack={favouriteTrack}
                onSelect={applyFavouriteTrack}
                reloadKey={favouritesReloadKey}
              />
              <FilterGroup
                label="Country"
                options={[{ label: "All countries", value: "all" }, ...(metadata?.countryOptions ?? [])]}
                selectedValue={filters.country}
                onChange={updateCountry}
              />
              <FilterGroup
                label="Discipline"
                options={[{ label: "All disciplines", value: "all" }, ...(metadata?.disciplineOptions ?? [])]}
                selectedValue={filters.discipline}
                onChange={(value) => updateFilter("discipline", value)}
              />
              <FilterGroup
                label="Racecourse"
                options={[{ label: "All courses", value: "all" }, ...courseOptions]}
                selectedValue={filters.course}
                onChange={(value) => updateFilter("course", value)}
              />

              <FavouriteTrackControl onChange={refreshFavouriteFilters} track={favouriteTrack} />

              <View key={filterKey}>
                {errorMessage ? (
                  <View style={styles.errorState}>
                    <Text style={styles.errorStateText}>{errorMessage}</Text>
                  </View>
                ) : isLoadingMetadata || isLoadingRaces ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>Loading races from Supabase.</Text>
                  </View>
                ) : races.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No races match these filters.</Text>
                  </View>
                ) : races.map((race) => (
                  <View key={race.raceId} style={styles.raceRow}>
                    <View style={styles.raceNumber}>
                      <Text style={styles.raceNumberText}>R{race.number}</Text>
                    </View>
                    <View style={styles.raceContent}>
                      <Text style={styles.raceTitle}>
                        {race.dateLabel} · {race.track}
                      </Text>
                      <Text style={styles.raceMeta}>
                        {race.raceName} · {race.starters} starters · {race.code} · {race.country}
                      </Text>
                      <Text style={styles.raceMeta}>
                        Fav: {race.favourite} ({race.favouriteFinish})
                      </Text>
                    </View>
                    <View style={styles.resultBlock}>
                      <Text style={styles.result}>{race.result}</Text>
                      <Text style={styles.payout}>{race.payout}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Keeps the initial Race Days load compact while allowing expanded filtered queries.
 */
function isDefaultRaceDayView(filters: RaceDayFilters, metadata: RaceDayMetadata) {
  return filters.country === "all"
    && filters.course === "all"
    && filters.discipline === "all"
    && filters.fromDate === metadata.defaultDateRange.from
    && filters.toDate === metadata.defaultDateRange.to;
}

function isDefaultUfcView(filters: UfcHistoricalFilters, metadata: UfcHistoricalMetadata) {
  return filters.fromDate === metadata.defaultDateRange.from
    && filters.toDate === metadata.defaultDateRange.to;
}

function isConcreteFavouriteTrack(
  filters: RaceDayFilters,
  selectedCourseLabel: string,
): filters is RaceDayFilters & { discipline: "horse" | "harness" | "greyhound" } {
  return filters.country !== "all"
    && filters.course !== "all"
    && selectedCourseLabel.length > 0
    && (filters.discipline === "horse"
      || filters.discipline === "harness"
      || filters.discipline === "greyhound");
}

type HistoricalBacktestPerformancePanelProps = {
  activeHistoryType: HistoricalBacktestHistoryType;
  activeModelKey: WinPercentageMultiModelKey;
  errorMessage: string | null;
  isLoading: boolean;
  onChangeHistoryType: (value: HistoricalBacktestHistoryType) => void;
  onChangeModel: (value: WinPercentageMultiModelKey) => void;
  onChangeRank: (value: HistoricalBacktestRankFilter) => void;
  rankFilter: HistoricalBacktestRankFilter;
  sport: HistoricalSport;
  stats: FavouriteStat[];
};

/**
 * Displays historical model backtest performance without live recommendation history rows.
 */
function HistoricalBacktestPerformancePanel({
  activeHistoryType,
  activeModelKey,
  errorMessage,
  isLoading,
  onChangeHistoryType,
  onChangeModel,
  onChangeRank,
  rankFilter,
  sport,
  stats,
}: HistoricalBacktestPerformancePanelProps) {
  return (
    <View>
      <FilterGroup
        label="History type"
        options={HISTORICAL_BACKTEST_HISTORY_TYPE_OPTIONS}
        selectedValue={activeHistoryType}
        onChange={(value) => onChangeHistoryType(value as HistoricalBacktestHistoryType)}
      />
      <WinPercentageMultiModelTabs
        activeModelKey={activeModelKey}
        excludeModelKeys={[PLACING_PERCENTAGE_MULTI_MODEL_KEY]}
        onChange={onChangeModel}
        sport={sport}
      />
      <FilterGroup
        label="Win % multi ranks"
        options={HISTORICAL_BACKTEST_RANK_OPTIONS}
        selectedValue={rankFilter}
        onChange={(value) => onChangeRank(value as HistoricalBacktestRankFilter)}
      />
      <Text style={styles.historyBreakdownHeading}>Multi-bet win percentage performance</Text>
      {errorMessage ? (
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>{errorMessage}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Loading historical model performance from Supabase.</Text>
        </View>
      ) : stats.length ? (
        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statDetail}>{stat.detail}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No historical model performance is available for this selection.</Text>
        </View>
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

const styles = StyleSheet.create({
  countText: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    paddingVertical: 20,
  },
  emptyStateText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "700",
  },
  errorState: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorStateText: {
    color: "#9a3412",
    fontSize: 13,
    fontWeight: "700",
  },
  datePill: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
    borderRadius: 6,
    borderWidth: 1,
    color: "#0f5f58",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  filter: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  filterGroup: {
    marginBottom: 12,
  },
  filterLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  filterText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  historyBreakdownHeading: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heading: {
    color: "#18202f",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
  },
  payout: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  raceContent: {
    flex: 1,
  },
  raceMeta: {
    color: "#667085",
    fontSize: 13,
    marginTop: 3,
  },
  raceNumber: {
    alignItems: "center",
    backgroundColor: "#f2f4f7",
    borderRadius: 6,
    height: 38,
    justifyContent: "center",
    width: 42,
  },
  raceNumberText: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "800",
  },
  raceRow: {
    alignItems: "center",
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
  },
  raceTitle: {
    color: "#18202f",
    fontSize: 16,
    fontWeight: "800",
  },
  result: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  resultBlock: {
    maxWidth: 116,
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
    minWidth: 130,
    padding: 12,
  },
  statDetail: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  statLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  statValue: {
    color: "#18202f",
    fontSize: 20,
    fontWeight: "900",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
});
