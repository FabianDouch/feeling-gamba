import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  createDefaultPredictionHistoryFilters,
  DEFAULT_PREDICTION_MODEL_KEY,
  fetchPredictionStats,
  fetchPredictionHistoryMetadata,
  getPredictionHistoryCourseOptions,
  hasSupabasePredictionsConfig,
  PREDICTION_MODEL_VARIANTS,
  type PredictionPerformanceDisciplineFilter,
  type PredictionPerformanceFilters,
  type PredictionPerformanceRankFilter,
  type PredictionPerformanceSignalFilter,
  type PredictionHistoryFilters,
  type PredictionHistoryMetadata,
  type PredictionModelKey,
  type PredictionsData,
} from "../data/supabasePredictions";
import { BetCandidatesSection } from "./BetCandidatesSection";

const emptyPredictions: PredictionsData = {
  disciplineReturns: [],
  history: [],
  summaryStats: [],
  totalHistoryCount: 0,
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

/**
 * Shows stored Betcha candidate prediction outcomes by racing discipline.
 */
export function PredictionsScreen() {
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
  const [performanceFilters, setPerformanceFilters] = useState<PredictionPerformanceFilters>({
    discipline: "all",
    rank: "all",
    signal: "all",
  });
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const courseOptions = useMemo(() => getPredictionHistoryCourseOptions(metadata, filters.country), [
    filters.country,
    metadata,
  ]);
  const filterKey = `${filters.fromDate}-${filters.toDate}-${filters.country}-${filters.discipline}-${filters.course}`;
  const activeModel = PREDICTION_MODEL_VARIANTS.find((model) => model.key === activeModelKey)
    ?? PREDICTION_MODEL_VARIANTS[0];
  const hasPredictionRows = predictions.summaryStats.length > 0
    || predictions.disciplineReturns.length > 0
    || predictions.history.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!hasSupabasePredictionsConfig) {
        setErrorMessage("Supabase is not configured for Predictions.");
        setIsLoadingMetadata(false);
        return;
      }

      try {
        setIsLoadingMetadata(true);
        setErrorMessage(null);
        const nextMetadata = await fetchPredictionHistoryMetadata();

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
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPredictions() {
      if (!metadata || !filters.fromDate || !filters.toDate) {
        return;
      }

      try {
        setIsLoadingPredictions(true);
        setErrorMessage(null);
        const nextPredictions = await fetchPredictionStats(filters, activeModelKey, performanceFilters);

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
  }, [activeModelKey, filters, metadata, performanceFilters]);

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
      <Text style={styles.eyebrow}>Predictions</Text>
      <Text style={styles.heading}>Bet candidates</Text>
      <Text style={styles.note}>
        Current source-backed candidates and stored prediction outcomes reconciled against race results.
      </Text>

      <ModelTabs activeModelKey={activeModelKey} onChange={setActiveModelKey} />
      <View style={styles.modelInfo}>
        <Text style={styles.modelInfoTitle}>{activeModel.label}</Text>
        <Text style={styles.modelInfoText}>{activeModel.description}</Text>
        <Text style={styles.modelInfoDetail}>{activeModel.detail}</Text>
      </View>

      <Text style={styles.subheading}>Stored model performance</Text>
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

      <BetCandidatesSection predictionModelKey={activeModelKey} />

      {!errorMessage && !isLoadingMetadata && !isLoadingPredictions && hasPredictionRows ? (
        <>
          <Text style={styles.subheading}>$1 prediction return by discipline</Text>
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

          <Text style={styles.subheading}>Prediction history</Text>
          <DateRangeFilter
            fromDate={filters.fromDate}
            onChange={updateDateBoundary}
            onReset={resetDateRange}
            options={metadata?.dateOptions ?? []}
            toDate={filters.toDate}
            windowLabel={metadata?.latestWindowRangeLabel ?? "Loading available prediction dates"}
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
          <Text style={styles.historyCount}>
            {predictions.history.length} of {predictions.totalHistoryCount} predictions
          </Text>

          <View key={`${activeModelKey}-${filterKey}`}>
            {predictions.history.length ? predictions.history.map((prediction) => (
              <View key={prediction.id} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyTitleWrap}>
                    <Text style={styles.historyRace}>{prediction.raceLabel}</Text>
                    <Text style={styles.historyMeta}>
                      {prediction.startLabel} · {prediction.discipline} · {prediction.historyDetail}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.outcomeBadge,
                      prediction.outcomeTone === "good" ? styles.outcomeBadgeGood : null,
                      prediction.outcomeTone === "warning" ? styles.outcomeBadgeWarning : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.outcomeBadgeText,
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
                  <Text style={styles.historyReturnText}>Bonus {prediction.bonusCredit}</Text>
                  <Text style={styles.historyReturnText}>Total {prediction.totalValue}</Text>
                </View>
                <Text style={styles.historyTimestamp}>{prediction.predictedAtLabel}</Text>
              </View>
            )) : <StateMessage text="No prediction history matches these filters." />}
          </View>
        </>
      ) : null}
    </View>
  );
}

type ModelTabsProps = {
  activeModelKey: PredictionModelKey;
  onChange: (value: PredictionModelKey) => void;
};

function ModelTabs({ activeModelKey, onChange }: ModelTabsProps) {
  return (
    <View style={styles.modelTabs}>
      {PREDICTION_MODEL_VARIANTS.map((model) => {
        const isActive = model.key === activeModelKey;

        return (
          <Pressable
            key={model.key}
            onPress={() => onChange(model.key)}
            style={[styles.modelTab, isActive ? styles.modelTabActive : null]}
          >
            <Text style={[styles.modelTabText, isActive ? styles.modelTabTextActive : null]}>
              {model.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type StateMessageProps = {
  text: string;
  tone?: "default" | "error";
};

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

type DateRangeFilterProps = {
  fromDate: string;
  onChange: (key: "fromDate" | "toDate", value: string) => void;
  onReset: () => void;
  options: {
    label: string;
    value: string;
  }[];
  toDate: string;
  windowLabel: string;
};

function DateRangeFilter({
  fromDate,
  onChange,
  onReset,
  options,
  toDate,
  windowLabel,
}: DateRangeFilterProps) {
  return (
    <View style={styles.dateRangeGroup}>
      <View style={styles.dateRangeHeader}>
        <View>
          <Text style={styles.filterLabel}>Date range</Text>
          <Text style={styles.dateRangeNote}>{windowLabel}</Text>
        </View>
        <Pressable onPress={onReset} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>
      <View style={styles.dateRangeRow}>
        <DateStepper
          label="From"
          onChange={(value) => onChange("fromDate", value)}
          options={options}
          value={fromDate}
        />
        <DateStepper
          label="To"
          onChange={(value) => onChange("toDate", value)}
          options={options}
          value={toDate}
        />
      </View>
    </View>
  );
}

type DateStepperProps = {
  label: string;
  onChange: (value: string) => void;
  options: {
    label: string;
    value: string;
  }[];
  value: string;
};

function DateStepper({ label, onChange, options, value }: DateStepperProps) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext = selectedIndex >= 0 && selectedIndex < options.length - 1;

  function move(direction: -1 | 1) {
    if (selectedIndex < 0) {
      return;
    }

    const nextOption = options[selectedIndex + direction];

    if (nextOption) {
      onChange(nextOption.value);
    }
  }

  return (
    <View style={styles.dateStepper}>
      <Text style={styles.dateStepperLabel}>{label}</Text>
      <View style={styles.dateStepperControls}>
        <Pressable
          disabled={!canMovePrevious || options.length === 0}
          onPress={() => move(-1)}
          style={[
            styles.dateStepButton,
            !canMovePrevious ? styles.dateStepButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.dateStepButtonText,
              !canMovePrevious ? styles.dateStepButtonTextDisabled : null,
            ]}
          >
            {"<"}
          </Text>
        </Pressable>
        <Text style={styles.dateStepperValue}>
          {selectedOption?.label ?? "No dates"}
        </Text>
        <Pressable
          disabled={!canMoveNext || options.length === 0}
          onPress={() => move(1)}
          style={[
            styles.dateStepButton,
            !canMoveNext ? styles.dateStepButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.dateStepButtonText,
              !canMoveNext ? styles.dateStepButtonTextDisabled : null,
            ]}
          >
            {">"}
          </Text>
        </Pressable>
      </View>
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
  dateRangeGroup: {
    marginTop: 12,
  },
  dateRangeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dateRangeNote: {
    color: "#667085",
    fontSize: 12,
    marginTop: 2,
  },
  dateRangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dateStepButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  dateStepButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
  },
  dateStepButtonText: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  dateStepButtonTextDisabled: {
    color: "#98a2b3",
  },
  dateStepper: {
    flex: 1,
    minWidth: 210,
  },
  dateStepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dateStepperLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  dateStepperValue: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    color: "#18202f",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    minWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
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
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modelTabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
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
  resetButton: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resetButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
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
