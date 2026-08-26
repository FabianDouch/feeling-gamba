import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DateRangeFilter } from "../components/DateRangeFilter";
import { RaceDisciplineIcon } from "../components/RaceDisciplineIcon";
import {
  createDefaultPredictionHistoryFilters,
  CASH_PREDICTION_MODEL_VARIANTS,
  DEFAULT_PREDICTION_MODEL_KEY,
  fetchPredictionStats,
  fetchMultiBetRecommendationModelKeys,
  fetchPredictionHistoryMetadata,
  fetchRacingMultiBetRecommendationHistoryMetadata,
  fetchUfcPredictionHistoryMetadata,
  getPredictionHistoryCourseOptions,
  hasSupabasePredictionsConfig,
  isUfcPercentageMultiModel,
  PLACING_PERCENTAGE_MULTI_MODEL_KEY,
  SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  UFC_SINGLE_65_PLUS_MODEL_KEY,
  UFC_SINGLE_75_PLUS_MODEL_KEY,
  UFC_SINGLE_85_PLUS_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_VARIANTS,
  WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS,
  type PredictionPerformanceDisciplineFilter,
  type PredictionPerformanceFilters,
  type PredictionPerformanceRankFilter,
  type PredictionPerformanceSignalFilter,
  type PredictionHistoryFilters,
  type PredictionHistoryMetadata,
  type PredictionModelKey,
  type PredictionStatsFormat,
  type PredictionsData,
  type WinPercentageMultiModelKey,
  type WinPercentageMultiRankFilter,
} from "../data/supabasePredictions";
import {
  PredictionFormatTabs,
  PredictionModelTabs,
  PredictionSportTabs,
  PredictionTypeTabs,
  WinPercentageMultiModelTabs,
  type CurrentPredictionType,
  type PredictionFormat,
  type PredictionSport,
} from "./PredictionControls";

const emptyPredictions: PredictionsData = {
  disciplineReturns: [],
  history: [],
  historySummaryStats: [],
  multiBetHistory: [],
  multiBetPerformanceStats: [],
  multiBetSummaryStats: [],
  placingPerformanceStats: [],
  summaryStats: [],
  totalMultiBetHistoryCount: 0,
  totalHistoryCount: 0,
  totalWinPercentageMultiBetHistoryCount: 0,
  winPercentageMultiBetHistory: [],
  winPercentageMultiBetPerformanceStats: [],
  winPercentageMultiBetSummaryStats: [],
};
const PERFORMANCE_DISCIPLINE_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Horse", value: "horse" },
  { label: "Harness", value: "harness" },
  { label: "Greyhound", value: "greyhound" },
] satisfies { label: string; value: PredictionPerformanceDisciplineFilter }[];
const PERFORMANCE_RANK_OPTIONS = [
  { label: "All ranks", value: "all" },
  { label: "Top 1", value: "1" },
  { label: "Top 2", value: "2" },
  { label: "Top 3", value: "3" },
] satisfies { label: string; value: PredictionPerformanceRankFilter }[];
const PERFORMANCE_SIGNAL_OPTIONS = [
  { label: "All signals", value: "all" },
  { label: "Positive only", value: "positive_only" },
  { label: "Neutral or better", value: "neutral_or_better" },
] satisfies { label: string; value: PredictionPerformanceSignalFilter }[];
const MIN_PERCENTAGE_MULTI_RANK = 3;
type PredictionHistoryType = "cash_multis" | "placing" | "singles" | "win_percentage_multis";
const RACING_WIN_PERCENTAGE_MULTI_KEYS = [
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];
const UFC_WIN_PERCENTAGE_MULTI_KEYS = [
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];
const UFC_WIN_PERCENTAGE_SINGLE_KEYS = [
  UFC_SINGLE_65_PLUS_MODEL_KEY,
  UFC_SINGLE_75_PLUS_MODEL_KEY,
  UFC_SINGLE_85_PLUS_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];

/**
 * Shows stored prediction outcomes and history without current-day candidate panels.
 */
export function PredictionHistoryScreen() {
  const [filters, setFilters] = useState<PredictionHistoryFilters>({
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: "",
    toDate: "",
  });
  const [metadata, setMetadata] = useState<PredictionHistoryMetadata | null>(null);
  const [predictions, setPredictions] = useState<PredictionsData>(emptyPredictions);
  const [activeModelKey, setActiveModelKey] = useState<PredictionModelKey>(DEFAULT_PREDICTION_MODEL_KEY);
  const [activeSingleWinPercentageModelKey, setActiveSingleWinPercentageModelKey] =
    useState<PredictionModelKey>(SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY);
  const [activeSport, setActiveSport] = useState<PredictionSport>("racing");
  const [activeFormat, setActiveFormat] = useState<PredictionFormat>("singles");
  const [activePredictionType, setActivePredictionType] = useState<CurrentPredictionType>("cash");
  const [multiBetModelKeys, setMultiBetModelKeys] = useState<PredictionModelKey[]>([]);
  const [performanceFilters, setPerformanceFilters] = useState<PredictionPerformanceFilters>({
    discipline: "all",
    rank: "all",
    signal: "all",
  });
  const [activeWinPercentageMultiModelKey, setActiveWinPercentageMultiModelKey] =
    useState<WinPercentageMultiModelKey>(WIN_PERCENTAGE_MULTI_MODEL_KEY);
  const [winPercentageMultiRankFilter, setWinPercentageMultiRankFilter] =
    useState<WinPercentageMultiRankFilter>("all");
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const courseOptions = useMemo(() => getPredictionHistoryCourseOptions(metadata, filters.country), [
    filters.country,
    metadata,
  ]);
  const filterKey = `${filters.fromDate}-${filters.toDate}-${filters.country}-${filters.discipline}-${filters.course}`;
  const activeHistoryType = getActiveHistoryType(activeFormat, activePredictionType);
  const activePredictionModelKey = activeHistoryType === "singles" && activePredictionType === "win_percentage"
    ? activeSingleWinPercentageModelKey
    : activeModelKey;
  const activeCashModel = CASH_PREDICTION_MODEL_VARIANTS.find((model) => model.key === activeModelKey)
    ?? CASH_PREDICTION_MODEL_VARIANTS[0];
  const activeSingleWinPercentageModel = WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS.find((model) =>
    model.key === activeSingleWinPercentageModelKey)
    ?? WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS[0];
  const activeWinPercentageModel = WIN_PERCENTAGE_MULTI_MODEL_VARIANTS.find((model) =>
    model.key === activeWinPercentageMultiModelKey)
    ?? WIN_PERCENTAGE_MULTI_MODEL_VARIANTS[0];
  const isPlacePercentageMultiModel = activeWinPercentageMultiModelKey === PLACING_PERCENTAGE_MULTI_MODEL_KEY;
  const isUfcWinPercentageMultiModel = isUfcPercentageMultiModel(activeWinPercentageMultiModelKey);
  const isUfcHistory = activeSport === "ufc";
  const winPercentageMultiRankOptions = useMemo(() =>
    buildPercentageMultiRankOptions(activeWinPercentageMultiModelKey), [activeWinPercentageMultiModelKey]);
  const unsupportedHistoryMessage = getUnsupportedHistoryBranchMessage({
    activeFormat,
    activePredictionType,
    activeSport,
  });
  const activeModelInfo = getActiveHistoryModelInfo({
    activeCashModel,
    activeFormat,
    activePredictionType,
    activeSingleWinPercentageModel,
    activeSport,
    activeWinPercentageModel,
    unsupportedHistoryMessage,
  });
  const hasPredictionRows = predictions.summaryStats.length > 0
    || predictions.disciplineReturns.length > 0
    || predictions.history.length > 0
    || predictions.multiBetHistory.length > 0
    || predictions.multiBetPerformanceStats.length > 0
    || predictions.multiBetSummaryStats.length > 0
    || predictions.placingPerformanceStats.length > 0
    || predictions.winPercentageMultiBetHistory.length > 0
    || predictions.winPercentageMultiBetPerformanceStats.length > 0
    || predictions.winPercentageMultiBetSummaryStats.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadMultiBetModelKeys() {
      if (!hasSupabasePredictionsConfig) {
        return;
      }

      try {
        const nextModelKeys = await fetchMultiBetRecommendationModelKeys();

        if (!cancelled) {
          setMultiBetModelKeys(nextModelKeys);
        }
      } catch {
        if (!cancelled) {
          setMultiBetModelKeys([]);
        }
      }
    }

    loadMultiBetModelKeys();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!hasSupabasePredictionsConfig) {
        setErrorMessage("Supabase is not configured for Predictions.");
        setIsLoadingMetadata(false);
        return;
      }

      if (unsupportedHistoryMessage) {
        setMetadata(null);
        setPredictions(emptyPredictions);
        setIsLoadingMetadata(false);
        return;
      }

      try {
        setIsLoadingMetadata(true);
        setErrorMessage(null);
        const nextMetadata = activeSport === "ufc"
          ? await fetchUfcPredictionHistoryMetadata(activeWinPercentageMultiModelKey, activeFormat as PredictionStatsFormat)
          : activeHistoryType === "win_percentage_multis"
            ? await fetchRacingMultiBetRecommendationHistoryMetadata(activeWinPercentageMultiModelKey)
            : await fetchPredictionHistoryMetadata(activePredictionModelKey);

        if (!cancelled) {
          setMetadata(nextMetadata);
          setFilters(createDefaultPredictionHistoryFilters(nextMetadata));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Prediction metadata failed to load.");
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
  }, [
    activeHistoryType,
    activeFormat,
    activePredictionModelKey,
    activeSport,
    activeWinPercentageMultiModelKey,
    unsupportedHistoryMessage,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPredictions() {
      if (!metadata || !filters.fromDate || !filters.toDate) {
        return;
      }

      if (unsupportedHistoryMessage) {
        setPredictions(emptyPredictions);
        return;
      }

      try {
        setIsLoadingPredictions(true);
        setErrorMessage(null);
        const nextPredictions = await fetchPredictionStats(
          filters,
          activePredictionModelKey,
          performanceFilters,
          winPercentageMultiRankFilter,
          activeWinPercentageMultiModelKey,
          activeSport === "nrl" ? undefined : activeSport,
          activeFormat as PredictionStatsFormat,
        );

        if (!cancelled) {
          setPredictions(nextPredictions);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Prediction history failed to load.");
          setPredictions(emptyPredictions);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPredictions(false);
        }
      }
    }

    loadPredictions();

    return () => {
      cancelled = true;
    };
  }, [
    activePredictionModelKey,
    activeWinPercentageMultiModelKey,
    activeFormat,
    activeSport,
    filters,
    metadata,
    performanceFilters,
    unsupportedHistoryMessage,
    winPercentageMultiRankFilter,
  ]);

  useEffect(() => {
    if (activeSport === "ufc") {
      if (!isUfcPercentageMultiModel(activeWinPercentageMultiModelKey)) {
        setActiveWinPercentageMultiModelKey(UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY);
      }
    } else if (isUfcPercentageMultiModel(activeWinPercentageMultiModelKey)) {
      setActiveWinPercentageMultiModelKey(WIN_PERCENTAGE_MULTI_MODEL_KEY);
    }
  }, [activeSport, activeWinPercentageMultiModelKey]);

  useEffect(() => {
    const allowedRanks = new Set(winPercentageMultiRankOptions.map((option) => option.value));

    if (!allowedRanks.has(winPercentageMultiRankFilter)) {
      setWinPercentageMultiRankFilter("all");
    }
  }, [winPercentageMultiRankFilter, winPercentageMultiRankOptions]);

  function updateSport(value: PredictionSport) {
    setActiveSport(value);

    if (value === "ufc") {
      setActiveFormat("multis");
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY);
      return;
    }

    if (value === "nrl") {
      setActiveFormat("singles");
      setActivePredictionType("win_percentage");
      return;
    }

    setActiveWinPercentageMultiModelKey(WIN_PERCENTAGE_MULTI_MODEL_KEY);
  }

  function updateFormat(value: PredictionFormat) {
    setActiveFormat(value);

    if (activeSport === "ufc" && value === "singles") {
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(UFC_SINGLE_65_PLUS_MODEL_KEY);
    } else if (activeSport === "ufc" && value === "multis") {
      setActiveWinPercentageMultiModelKey(UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY);
    }
  }

  function updatePredictionType(value: CurrentPredictionType) {
    setActivePredictionType(value);

    if (value === "win_percentage") {
      setActiveWinPercentageMultiModelKey(activeSport === "ufc"
        ? activeFormat === "singles" ? UFC_SINGLE_65_PLUS_MODEL_KEY : UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY
        : WIN_PERCENTAGE_MULTI_MODEL_KEY);
    } else if (value === "placing") {
      setActiveWinPercentageMultiModelKey(PLACING_PERCENTAGE_MULTI_MODEL_KEY);
    }
  }

  function updateFilter(key: keyof PredictionHistoryFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  /**
   * Applies a country filter and clears course to keep the selected course valid.
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

  /**
   * Applies one Stored model performance filter without changing history filters.
   */
  function updatePerformanceFilter<TKey extends keyof PredictionPerformanceFilters>(
    key: TKey,
    value: PredictionPerformanceFilters[TKey],
  ) {
    setPerformanceFilters((current) => ({
      ...current,
      [key]: value,
    }));
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

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Prediction History</Text>
      <Text style={styles.heading}>Stored prediction outcomes</Text>
      <Text style={styles.note}>
        Review settled and pending outcomes by prediction type. Today's current candidates live in Predictions.
      </Text>

      <Text style={styles.subheading}>Stored model performance</Text>
      <Text style={styles.sectionIntro}>
        Historical prediction outcomes split by type. These stats are stored results, not today's candidate list.
      </Text>
      <PredictionSportTabs
        activeSport={activeSport}
        onChange={updateSport}
      />

      <PredictionFormatTabs
        activeFormat={activeFormat}
        onChange={updateFormat}
      />

      <PredictionTypeTabs
        activeType={activePredictionType}
        onChange={updatePredictionType}
      />

      {activeSport === "racing" && activePredictionType === "cash" ? (
        <PredictionModelTabs
          activeModelKey={activeModelKey}
          models={CASH_PREDICTION_MODEL_VARIANTS}
          multiBetModelKeys={activeFormat === "multis" ? multiBetModelKeys : []}
          onChange={setActiveModelKey}
        />
      ) : null}

      {activeSport === "racing" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeSingleWinPercentageModelKey}
          models={WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS}
          onChange={setActiveSingleWinPercentageModelKey}
        />
      ) : null}

      {activeSport === "racing" && activeFormat === "multis" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={RACING_WIN_PERCENTAGE_MULTI_KEYS}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      {activeSport === "racing" && activeFormat === "multis" && activePredictionType === "placing" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={[PLACING_PERCENTAGE_MULTI_MODEL_KEY]}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      {activeSport === "ufc" && activeFormat === "multis" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={UFC_WIN_PERCENTAGE_MULTI_KEYS}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      {activeSport === "ufc" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={UFC_WIN_PERCENTAGE_SINGLE_KEYS}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      <View style={styles.modelInfo}>
        <Text style={styles.modelInfoTitle}>{activeModelInfo.label}</Text>
        <Text style={styles.modelInfoText}>{activeModelInfo.description}</Text>
        <Text style={styles.modelInfoDetail}>{activeModelInfo.detail}</Text>
      </View>

      {unsupportedHistoryMessage ? (
        <StateMessage text={unsupportedHistoryMessage} />
      ) : (
        <>
      {!isUfcHistory && (activeHistoryType === "singles" || activeHistoryType === "placing") ? (
        <View style={styles.performanceFilters}>
          <FilterGroup
            label="Performance discipline"
            options={PERFORMANCE_DISCIPLINE_OPTIONS}
            selectedValue={performanceFilters.discipline}
            onChange={(value) => updatePerformanceFilter(
              "discipline",
              value as PredictionPerformanceDisciplineFilter,
            )}
          />
          <FilterGroup
            label="Prediction rank"
            options={PERFORMANCE_RANK_OPTIONS}
            selectedValue={performanceFilters.rank}
            onChange={(value) => updatePerformanceFilter(
              "rank",
              value as PredictionPerformanceRankFilter,
            )}
          />
          <FilterGroup
            label="Signal"
            options={PERFORMANCE_SIGNAL_OPTIONS}
            selectedValue={performanceFilters.signal}
            onChange={(value) => updatePerformanceFilter(
              "signal",
              value as PredictionPerformanceSignalFilter,
            )}
          />
          <Text style={styles.performanceFilterNote}>
            Neutral or better includes Positive and Neutral only; Small sample and Limited history are excluded.
          </Text>
        </View>
      ) : null}

      {activeHistoryType === "singles" ? (
        <>
          <Text style={styles.historyBreakdownHeading}>Single prediction performance</Text>
          {errorMessage ? (
            <StateMessage tone="error" text={errorMessage} />
          ) : isLoadingMetadata || isLoadingPredictions ? (
            <StateMessage text="Loading stored predictions from Supabase." />
          ) : predictions.summaryStats.length ? (
            <View style={styles.statsRow}>
              {predictions.summaryStats.map((stat) => (
                <View key={stat.label} style={styles.stat}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statDetail}>{stat.detail}</Text>
                </View>
              ))}
            </View>
          ) : (
            <StateMessage text="No stored prediction performance is available yet." />
          )}
        </>
      ) : null}

      {!errorMessage && !isLoadingMetadata && !isLoadingPredictions ? (
        <>
          {activeHistoryType === "placing" ? (
            <>
              <Text style={styles.historyBreakdownHeading}>Placing prediction performance</Text>
              {predictions.placingPerformanceStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.placingPerformanceStats.map((stat) => (
                    <View key={`placing-performance-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text="No place-eligible settled predictions are available for this model yet." />
              )}
            </>
          ) : null}

          {activeHistoryType === "cash_multis" ? (
            <>
              <Text style={styles.historyBreakdownHeading}>Multi-bet prediction performance</Text>
              {predictions.multiBetPerformanceStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.multiBetPerformanceStats.map((stat) => (
                    <View key={`multi-performance-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text="No multi-bet prediction performance is available for this model yet." />
              )}
            </>
          ) : null}

          {activeHistoryType === "win_percentage_multis" ? (
            <>
              <FilterGroup
                label={isPlacePercentageMultiModel ? "Place percentage multi ranks" : "Win percentage multi ranks"}
                options={winPercentageMultiRankOptions}
                selectedValue={winPercentageMultiRankFilter}
                onChange={(value) => setWinPercentageMultiRankFilter(value as WinPercentageMultiRankFilter)}
              />
              <Text style={styles.historyBreakdownHeading}>
                {isUfcWinPercentageMultiModel
                  ? "UFC win percentage multi performance"
                  : isPlacePercentageMultiModel
                    ? "Multi-bet place percentage performance"
                    : "Multi-bet win percentage performance"}
              </Text>
              {predictions.winPercentageMultiBetPerformanceStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.winPercentageMultiBetPerformanceStats.map((stat) => (
                    <View key={`win-percentage-multi-performance-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text={isUfcWinPercentageMultiModel
                  ? "No UFC win-percentage multi performance is available yet."
                  : isPlacePercentageMultiModel
                    ? "No place-percentage multi-bet performance is available yet."
                    : "No win-percentage multi-bet performance is available yet."}
                />
              )}
            </>
          ) : null}
        </>
      ) : null}

      {!errorMessage && !isLoadingMetadata && !isLoadingPredictions && hasPredictionRows ? (
        <>
          {activeHistoryType === "singles" && !isUfcHistory ? (
            <>
              <Text style={styles.subheading}>Discipline prediction performance</Text>
              {predictions.disciplineReturns.length ? predictions.disciplineReturns.map((row) => (
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
                    <View style={styles.returnMetric}>
                      <Text style={styles.returnMetricValue}>{row.promoNetReturn}</Text>
                      <Text style={styles.returnMetricLabel}>Cash+bonus net</Text>
                    </View>
                  </View>

                  <Text style={styles.missingText}>
                    Win rate {row.winRate}; cash ROI {row.roi}; cash+bonus ROI{" "}
                    {row.promoRoi}; cash+bonus value {row.totalPromoValue};
                    unresolved outcomes {row.missingPrices}.
                  </Text>
                </View>
              )) : <StateMessage text="No settled prediction outcomes by discipline yet." />}
            </>
          ) : null}

          {activeHistoryType !== "placing" ? (
            <>
              <Text style={styles.subheading}>
                {getHistoryListHeading(activeHistoryType)}
              </Text>
              <DateRangeFilter
                availableLabel="available prediction dates"
                fromDate={filters.fromDate}
                onChange={updateDateBoundary}
                onReset={resetDateRange}
                options={metadata?.dateOptions ?? []}
                toDate={filters.toDate}
                windowLabel={metadata?.latestWindowRangeLabel ?? "Loading available prediction dates"}
              />
              {isUfcHistory ? null : (
                <>
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
                </>
              )}
            </>
          ) : null}

          {activeHistoryType === "singles" ? (
            <>
              <Text style={styles.historyBreakdownHeading}>Date range breakdown</Text>
              {predictions.historySummaryStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.historySummaryStats.map((stat) => (
                    <View key={`history-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text="No prediction outcomes match this history filter range." />
              )}
            </>
          ) : null}

          {activeHistoryType === "cash_multis" ? (
            <>
              <Text style={styles.historyBreakdownHeading}>Multi bet date range breakdown</Text>
              {predictions.multiBetSummaryStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.multiBetSummaryStats.map((stat) => (
                    <View key={`multi-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text="No tracked multi bet recommendations match this history filter range." />
              )}
            </>
          ) : null}

          {activeHistoryType === "win_percentage_multis" ? (
            <>
              <Text style={styles.historyBreakdownHeading}>
                {isUfcWinPercentageMultiModel
                  ? "UFC win percentage multi date range breakdown"
                  : isPlacePercentageMultiModel
                    ? "Place percentage multi date range breakdown"
                    : "Win percentage multi date range breakdown"}
              </Text>
              {predictions.winPercentageMultiBetSummaryStats.length ? (
                <View style={styles.statsRow}>
                  {predictions.winPercentageMultiBetSummaryStats.map((stat) => (
                    <View key={`win-percentage-multi-${stat.label}`} style={styles.stat}>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statDetail}>{stat.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <StateMessage text={isUfcWinPercentageMultiModel
                  ? "No tracked UFC multi recommendations match this history filter range."
                  : isPlacePercentageMultiModel
                    ? "No tracked place-percentage multi recommendations match this history filter range."
                    : "No tracked win-percentage multi recommendations match this history filter range."}
                />
              )}
            </>
          ) : null}

          {activeHistoryType === "cash_multis" ? (
            <>
              <Text style={styles.historyCount}>
                {predictions.multiBetHistory.length} of {predictions.totalMultiBetHistoryCount} multi recommendations
              </Text>

              <View key={`${activePredictionModelKey}-${filterKey}-multi`}>
                {predictions.multiBetHistory.length ? predictions.multiBetHistory.map((recommendation) => (
                  <View key={recommendation.id} style={styles.historyRow}>
                    <View style={styles.historyHeader}>
                      <View style={styles.historyTitleWrap}>
                        <Text style={styles.historyRace}>{recommendation.recommendationLabel}</Text>
                        <Text style={styles.historyMeta}>
                          {recommendation.sourceDateLabel} · {recommendation.summaryLabel}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.outcomeBadge,
                          recommendation.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                          recommendation.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.outcomeBadgeText,
                            recommendation.outcomeTone === "good" ? styles.outcomeBadgeTextGood : null,
                            recommendation.outcomeTone === "warning" ? styles.outcomeBadgeTextWarning : null,
                          ]}
                        >
                          {recommendation.outcomeLabel}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.historyReturnRow}>
                      <Text style={styles.historyReturnText}>Combined {recommendation.combinedFixedWinPrice}</Text>
                      <Text style={styles.historyReturnText}>{recommendation.averageScoreLabel} {recommendation.averageCashScore}</Text>
                      <Text style={styles.historyReturnText}>Cash return {recommendation.returnLabel}</Text>
                    </View>

                    <View style={styles.multiHistoryLegList}>
                      {recommendation.legs.map((leg) => (
                        <View key={leg.id} style={styles.multiHistoryLeg}>
                          <View style={styles.multiHistoryLegText}>
                            <View style={styles.multiHistoryLegTitleRow}>
                              <RaceDisciplineIcon code={leg.raceCode} size={16} />
                              <Text style={styles.multiHistoryLegTitle}>{leg.title}</Text>
                            </View>
                            <Text style={styles.historyRunner}>{leg.runnerLabel}</Text>
                            <Text style={styles.historyMeta}>{leg.metaLabel}</Text>
                          </View>
                          <View
                            style={[
                              styles.outcomeBadge,
                              leg.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                              leg.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.outcomeBadgeText,
                                leg.outcomeTone === "good" ? styles.outcomeBadgeTextGood : null,
                                leg.outcomeTone === "warning" ? styles.outcomeBadgeTextWarning : null,
                              ]}
                            >
                              {leg.outcomeLabel}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <Text style={styles.historyTimestamp}>{recommendation.predictedAtLabel}</Text>
                  </View>
                )) : <StateMessage text="No tracked multi bet recommendation history matches these filters." />}
              </View>
            </>
          ) : null}

          {activeHistoryType === "win_percentage_multis" ? (
            <>
              <Text style={styles.historyCount}>
                {predictions.winPercentageMultiBetHistory.length} of {predictions.totalWinPercentageMultiBetHistoryCount} {isUfcWinPercentageMultiModel ? "UFC win percentage" : isPlacePercentageMultiModel ? "place percentage" : "win percentage"} multi recommendations
              </Text>

              <View key={`${activeWinPercentageMultiModelKey}-${filterKey}-${winPercentageMultiRankFilter}-win-percentage-multi`}>
                {predictions.winPercentageMultiBetHistory.length ? predictions.winPercentageMultiBetHistory.map((recommendation) => (
                  <View key={recommendation.id} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyTitleWrap}>
                    <Text style={styles.historyRace}>{recommendation.recommendationLabel}</Text>
                    <Text style={styles.historyMeta}>
                      {recommendation.sourceDateLabel} · {recommendation.summaryLabel}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.outcomeBadge,
                      recommendation.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                      recommendation.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.outcomeBadgeText,
                        recommendation.outcomeTone === "good" ? styles.outcomeBadgeTextGood : null,
                        recommendation.outcomeTone === "warning" ? styles.outcomeBadgeTextWarning : null,
                      ]}
                    >
                      {recommendation.outcomeLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyReturnRow}>
                  <Text style={styles.historyReturnText}>
                    {isPlacePercentageMultiModel
                      ? `Combined place ${recommendation.combinedFixedPlacePrice}`
                      : `Combined ${recommendation.combinedFixedWinPrice}`}
                  </Text>
                  <Text style={styles.historyReturnText}>{recommendation.averageScoreLabel} {recommendation.averageCashScore}</Text>
                  <Text style={styles.historyReturnText}>Cash return {recommendation.returnLabel}</Text>
                </View>

                <View style={styles.multiHistoryLegList}>
                  {recommendation.legs.map((leg) => (
                    <View key={leg.id} style={styles.multiHistoryLeg}>
                      <View style={styles.multiHistoryLegText}>
                        <View style={styles.multiHistoryLegTitleRow}>
                          <RaceDisciplineIcon code={leg.raceCode} size={16} />
                          <Text style={styles.multiHistoryLegTitle}>{leg.title}</Text>
                        </View>
                        <Text style={styles.historyRunner}>{leg.runnerLabel}</Text>
                        <Text style={styles.historyMeta}>{leg.metaLabel}</Text>
                      </View>
                      <View
                        style={[
                          styles.outcomeBadge,
                          leg.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                          leg.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.outcomeBadgeText,
                            leg.outcomeTone === "good" ? styles.outcomeBadgeTextGood : null,
                            leg.outcomeTone === "warning" ? styles.outcomeBadgeTextWarning : null,
                          ]}
                        >
                          {leg.outcomeLabel}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Text style={styles.historyTimestamp}>{recommendation.predictedAtLabel}</Text>
              </View>
                )) : <StateMessage text={isPlacePercentageMultiModel
                  ? "No tracked place-percentage multi recommendation history matches these filters."
                  : "No tracked win-percentage multi recommendation history matches these filters."}
                />}
              </View>
            </>
          ) : null}

          {activeHistoryType === "singles" ? (
            <>
              <Text style={styles.historyCount}>
                {predictions.history.length} of {predictions.totalHistoryCount} predictions
              </Text>

              <View key={`${activePredictionModelKey}-${filterKey}`}>
                {predictions.history.length ? predictions.history.map((prediction) => (
                  <View key={prediction.id} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyTitleWrap}>
                    <View style={styles.historyRaceRow}>
                      <RaceDisciplineIcon code={prediction.discipline} size={16} />
                      <Text style={styles.historyRace}>{prediction.raceLabel}</Text>
                    </View>
                    <Text style={styles.historyMeta}>
                      {prediction.startLabel} · {prediction.discipline} · {prediction.historyDetail}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.outcomeBadge,
                      prediction.outcomeTone === "bonus" ? styles.outcomeBadgeBonus : null,
                      prediction.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                      prediction.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.outcomeBadgeText,
                        prediction.outcomeTone === "bonus" ? styles.outcomeBadgeTextBonus : null,
                        prediction.outcomeTone === "good" ? styles.outcomeBadgeTextGood : null,
                        prediction.outcomeTone === "warning" ? styles.outcomeBadgeTextWarning : null,
                      ]}
                    >
                      {prediction.outcomeLabel}
                    </Text>
                  </View>
                </View>

                <Text style={styles.historyRunner}>{prediction.runnerLabel}</Text>
                <Text style={styles.historyMeta}>
                  {prediction.predictionMeta} · {prediction.signalLabel}
                </Text>
                <View style={styles.historyReturnRow}>
                  <Text style={styles.historyReturnText}>Cash {prediction.cashReturn}</Text>
                  {isUfcHistory ? null : (
                    <>
                      <Text style={styles.historyReturnText}>Bonus {prediction.bonusCredit}</Text>
                      <Text style={styles.historyReturnText}>Total {prediction.totalValue}</Text>
                    </>
                  )}
                </View>
                <Text style={styles.historyTimestamp}>{prediction.predictedAtLabel}</Text>
              </View>
                )) : <StateMessage text="No prediction history matches these filters." />}
              </View>
            </>
          ) : null}
        </>
      ) : null}
        </>
      )}
    </View>
  );
}

type StateMessageProps = {
  text: string;
  tone?: "default" | "error";
};

type HistoryActiveModelInfoInput = {
  activeCashModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeFormat: PredictionFormat;
  activePredictionType: CurrentPredictionType;
  activeSingleWinPercentageModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeSport: PredictionSport;
  activeWinPercentageModel: {
    description: string;
    detail: string;
    label: string;
  };
  unsupportedHistoryMessage: string | null;
};

/**
 * Maps the shared four-level controls onto the existing stored history data families.
 */
function getActiveHistoryType(
  activeFormat: PredictionFormat,
  activePredictionType: CurrentPredictionType,
): PredictionHistoryType {
  if (activePredictionType === "cash") {
    return activeFormat === "multis" ? "cash_multis" : "singles";
  }

  if (activePredictionType === "placing") {
    return activeFormat === "multis" ? "win_percentage_multis" : "placing";
  }

  return activeFormat === "multis" ? "win_percentage_multis" : "singles";
}

/**
 * Explains shared UI branches that are reserved for future model families.
 */
function getUnsupportedHistoryBranchMessage({
  activeFormat,
  activePredictionType,
  activeSport,
}: {
  activeFormat: PredictionFormat;
  activePredictionType: CurrentPredictionType;
  activeSport: PredictionSport;
}) {
  if (activeSport === "ufc" && activePredictionType !== "win_percentage") {
    return `No UFC ${activeFormat === "singles" ? "single" : "multi"} ${activePredictionType} history is tracked yet.`;
  }

  if (activeSport === "nrl") {
    return "NRL prediction history is not tracked yet. Current NRL single predictions are available on the Predictions tab.";
  }

  return null;
}

/**
 * Returns the model description shown for the selected history branch.
 */
function getActiveHistoryModelInfo({
  activeCashModel,
  activeFormat,
  activePredictionType,
  activeSingleWinPercentageModel,
  activeSport,
  activeWinPercentageModel,
  unsupportedHistoryMessage,
}: HistoryActiveModelInfoInput) {
  if (unsupportedHistoryMessage) {
    return {
      description: "This branch is reserved for future model history.",
      detail: "The controls are present so each sport can use the same Singles and Multis history structure as models are added.",
      label: `${activeSport === "ufc" ? "UFC" : activeSport === "nrl" ? "NRL" : "Racing"} ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activePredictionType === "cash") {
    return activeFormat === "multis"
      ? {
        description: activeCashModel.description,
        detail: `${activeCashModel.detail} History is read from tracked cash multi recommendations for this model.`,
        label: activeCashModel.label,
      }
      : activeCashModel;
  }

  if (activePredictionType === "win_percentage" && activeFormat === "singles") {
    if (activeSport === "ufc") {
      return {
        description: activeWinPercentageModel.description.replace("Builds a UFC same-card multi", "Tracks UFC single candidates"),
        detail: `${activeWinPercentageModel.detail} Each eligible fight is stored as a separate $1 single outcome.`,
        label: activeWinPercentageModel.label,
      };
    }

    return activeSingleWinPercentageModel;
  }

  if (activePredictionType === "placing" && activeFormat === "singles") {
    return {
      description: "Shows settled place-return performance for favourite place signals.",
      detail: "Place eligibility uses country-aware market depth and the selected cash model's stored single rows.",
      label: "Placing singles",
    };
  }

  return activeWinPercentageModel;
}

/**
 * Names the itemised history list for the selected stored prediction family.
 */
function getHistoryListHeading(historyType: PredictionHistoryType) {
  if (historyType === "cash_multis") {
    return "Cash multi history";
  }

  if (historyType === "win_percentage_multis") {
    return "Percentage multi history";
  }

  return "Prediction history";
}

/**
 * Converts prediction type ids into short labels for model cards.
 */
function getPredictionTypeLabel(type: CurrentPredictionType) {
  if (type === "win_percentage") {
    return "Win %";
  }

  return type === "placing" ? "Placing" : "Cash";
}

/**
 * Builds only the rank filters that can exist for the selected percentage multi model.
 */
function buildPercentageMultiRankOptions(modelKey: WinPercentageMultiModelKey) {
  const maxRank = getPercentageMultiMaxLegs(modelKey);
  const options: { label: string; value: WinPercentageMultiRankFilter }[] = [
    { label: "All legs", value: "all" },
  ];

  for (let rank = MIN_PERCENTAGE_MULTI_RANK; rank <= maxRank; rank += 1) {
    options.push({
      label: `Top ${rank}`,
      value: String(rank) as WinPercentageMultiRankFilter,
    });
  }

  return options;
}

/**
 * Mirrors the stored recommendation caps so history filters do not offer impossible ranks.
 */
function getPercentageMultiMaxLegs(modelKey: WinPercentageMultiModelKey) {
  if (
    modelKey === WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY
    || modelKey === WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY
  ) {
    return 10;
  }

  if (modelKey === PLACING_PERCENTAGE_MULTI_MODEL_KEY || isUfcPercentageMultiModel(modelKey)) {
    return 8;
  }

  return 5;
}

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
  errorState: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  errorStateText: {
    color: "#9a3412",
  },
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  heading: {
    color: "#18202f",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
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
    marginTop: 12,
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
    color: "#475467",
    fontSize: 13,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  historyCount: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
  },
  historyBreakdownHeading: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14,
  },
  historyHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  historyMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  historyRace: {
    color: "#18202f",
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  historyRaceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  historyReturnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  historyReturnText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  historyRow: {
    borderTopColor: "#e4e7ec",
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  historyRunner: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  historyTimestamp: {
    color: "#98a2b3",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  historyTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  missingText: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  multiHistoryLeg: {
    alignItems: "flex-start",
    borderTopColor: "#edf0f5",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  multiHistoryLegList: {
    marginTop: 8,
  },
  multiHistoryLegText: {
    flex: 1,
    minWidth: 0,
  },
  multiHistoryLegTitle: {
    color: "#18202f",
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  multiHistoryLegTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  modelInfo: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  modelInfoDetail: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  modelInfoText: {
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  modelInfoTitle: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  modelTab: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 12,
    position: "relative",
  },
  modelTabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  modelTabMultiTag: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: "absolute",
    right: 4,
    top: -7,
  },
  modelTabMultiTagText: {
    color: "#92400e",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },
  modelTabText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "800",
  },
  modelTabTextActive: {
    color: "#ffffff",
  },
  modelTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  note: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  outcomeBadge: {
    backgroundColor: "#f8fafc",
    borderColor: "#d0d5dd",
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  outcomeBadgeBonus: {
    backgroundColor: "#fef9c3",
    borderColor: "#fde047",
  },
  outcomeBadgeGood: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  outcomeBadgeText: {
    color: "#475467",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "right",
  },
  outcomeBadgeTextBonus: {
    color: "#854d0e",
  },
  outcomeBadgeTextGood: {
    color: "#067647",
  },
  outcomeBadgeTextWarning: {
    color: "#9a3412",
  },
  outcomeBadgeWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  performanceFilterNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  performanceFilters: {
    marginTop: 2,
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
    flexWrap: "wrap",
    gap: 10,
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
    minWidth: 92,
  },
  returnMetricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  returnMetricValue: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
  },
  returnNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  sectionDivider: {
    borderTopColor: "#e4e7ec",
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 2,
  },
  sectionIntro: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
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
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 18,
  },
});
