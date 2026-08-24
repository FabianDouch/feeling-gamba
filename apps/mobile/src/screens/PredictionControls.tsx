import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CASH_PREDICTION_MODEL_VARIANTS,
  PREDICTION_MODEL_VARIANTS,
  WIN_PERCENTAGE_MULTI_MODEL_VARIANTS,
  WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS,
  type PredictionModelKey,
  type PredictionModelVariant,
  type WinPercentageMultiModelKey,
} from "../data/supabasePredictions";

export type PredictionSport = "racing" | "ufc";
export type PredictionFormat = "multis" | "singles";
export type CurrentPredictionType = "cash" | "placing" | "win_percentage";

const PREDICTION_SPORT_OPTIONS = [
  {
    label: "Racing",
    value: "racing",
  },
  {
    label: "UFC",
    value: "ufc",
  },
] satisfies {
  label: string;
  value: PredictionSport;
}[];

const PREDICTION_TYPE_OPTIONS = [
  {
    description: "Current ranked favourites from the selected cash-return model.",
    label: "Cash",
    value: "cash",
  },
  {
    description: "Current signals built from historical win percentages.",
    label: "Win %",
    value: "win_percentage",
  },
  {
    description: "Current favourite place signals using country-aware place depth.",
    label: "Placing",
    value: "placing",
  },
] satisfies {
  description: string;
  label: string;
  value: CurrentPredictionType;
}[];

const PREDICTION_FORMAT_OPTIONS = [
  {
    label: "Singles",
    value: "singles",
  },
  {
    label: "Multis",
    value: "multis",
  },
] satisfies {
  label: string;
  value: PredictionFormat;
}[];

type PredictionModelTabsProps = {
  activeModelKey: PredictionModelKey;
  models?: PredictionModelVariant[];
  multiBetModelKeys?: PredictionModelKey[];
  onChange: (value: PredictionModelKey) => void;
};

type PredictionSportTabsProps = {
  activeSport: PredictionSport;
  onChange: (value: PredictionSport) => void;
};

type PredictionFormatTabsProps = {
  activeFormat: PredictionFormat;
  onChange: (value: PredictionFormat) => void;
};

/**
 * Switches prediction screens between sport-specific current and historical models.
 */
export function PredictionSportTabs({ activeSport, onChange }: PredictionSportTabsProps) {
  return (
    <View style={styles.typeTabs}>
      {PREDICTION_SPORT_OPTIONS.map((option) => {
        const isActive = option.value === activeSport;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.value)}
            style={[styles.sportTab, isActive ? styles.typeTabActive : null]}
          >
            <Text style={[styles.typeTabText, isActive ? styles.typeTabTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Switches between single-runner and multi-runner prediction formats.
 */
export function PredictionFormatTabs({ activeFormat, onChange }: PredictionFormatTabsProps) {
  return (
    <View style={styles.typeTabs}>
      {PREDICTION_FORMAT_OPTIONS.map((option) => {
        const isActive = option.value === activeFormat;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.value)}
            style={[styles.sportTab, isActive ? styles.typeTabActive : null]}
          >
            <Text style={[styles.typeTabText, isActive ? styles.typeTabTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Renders the supported cash prediction model tabs with tracked-multi markers.
 */
export function PredictionModelTabs({
  activeModelKey,
  models = PREDICTION_MODEL_VARIANTS,
  multiBetModelKeys = [],
  onChange,
}: PredictionModelTabsProps) {
  const multiBetModels = new Set(multiBetModelKeys);

  return (
    <View style={styles.tabs}>
      {models.map((model) => {
        const isActive = model.key === activeModelKey;
        const hasMultiBet = multiBetModels.has(model.key);

        return (
          <Pressable
            key={model.key}
            onPress={() => onChange(model.key)}
            style={[styles.tab, isActive ? styles.tabActive : null]}
          >
            {hasMultiBet ? (
              <View style={styles.multiTag}>
                <Text style={styles.multiTagText}>Multi</Text>
              </View>
            ) : null}
            <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>
              {model.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type PredictionTypeTabsProps = {
  activeType: CurrentPredictionType;
  onChange: (value: CurrentPredictionType) => void;
};

/**
 * Separates current prediction families so cash, win-rate, and placing signals do not blend together.
 */
export function PredictionTypeTabs({ activeType, onChange }: PredictionTypeTabsProps) {
  return (
    <View style={styles.typeTabs}>
      {PREDICTION_TYPE_OPTIONS.map((option) => {
        const isActive = option.value === activeType;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.value)}
            style={[styles.typeTab, isActive ? styles.typeTabActive : null]}
          >
            <Text style={[styles.typeTabText, isActive ? styles.typeTabTextActive : null]}>
              {option.label}
            </Text>
            <Text style={[styles.typeTabDescription, isActive ? styles.typeTabDescriptionActive : null]}>
              {option.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type WinPercentageMultiModelTabsProps = {
  activeModelKey: WinPercentageMultiModelKey;
  excludeModelKeys?: WinPercentageMultiModelKey[];
  includeModelKeys?: WinPercentageMultiModelKey[];
  onChange: (value: WinPercentageMultiModelKey) => void;
  sport?: PredictionSport;
};

/**
 * Switches between tracked percentage multi model variants.
 */
export function WinPercentageMultiModelTabs({
  activeModelKey,
  excludeModelKeys = [],
  includeModelKeys,
  onChange,
  sport,
}: WinPercentageMultiModelTabsProps) {
  const excludedModelKeys = new Set(excludeModelKeys);
  const includedModelKeys = includeModelKeys ? new Set(includeModelKeys) : null;
  const models = sport
    ? WIN_PERCENTAGE_MULTI_MODEL_VARIANTS.filter((model) => model.sport === sport)
    : WIN_PERCENTAGE_MULTI_MODEL_VARIANTS;
  const visibleModels = models.filter((model) =>
    !excludedModelKeys.has(model.key)
    && (!includedModelKeys || includedModelKeys.has(model.key)));

  return (
    <View style={styles.typeTabs}>
      {visibleModels.map((model) => {
        const isActive = model.key === activeModelKey;

        return (
          <Pressable
            key={model.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(model.key)}
            style={[styles.typeTab, isActive ? styles.typeTabActive : null]}
          >
            <Text style={[styles.typeTabText, isActive ? styles.typeTabTextActive : null]}>
              {model.label}
            </Text>
            <Text style={[styles.typeTabDescription, isActive ? styles.typeTabDescriptionActive : null]}>
              {model.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export {
  CASH_PREDICTION_MODEL_VARIANTS,
  WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS,
};

const styles = StyleSheet.create({
  multiTag: {
    alignSelf: "flex-start",
    backgroundColor: "#fef3c7",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  multiTagText: {
    color: "#92400e",
    fontSize: 10,
    fontWeight: "900",
  },
  tab: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sportTab: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  tabText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeTab: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: 160,
    flexGrow: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typeTabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  typeTabDescription: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
  },
  typeTabDescriptionActive: {
    color: "#d0d5dd",
  },
  typeTabText: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "900",
  },
  typeTabTextActive: {
    color: "#ffffff",
  },
  typeTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
