import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  CASH_PREDICTION_MODEL_VARIANTS,
  DEFAULT_PREDICTION_MODEL_KEY,
  fetchMultiBetRecommendationModelKeys,
  hasSupabasePredictionsConfig,
  PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  PFL_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  PFL_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  PFL_SINGLE_65_PLUS_MODEL_KEY,
  PFL_SINGLE_75_PLUS_MODEL_KEY,
  PFL_SINGLE_85_PLUS_MODEL_KEY,
  PLACING_PERCENTAGE_MULTI_MODEL_KEY,
  SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  UFC_SINGLE_65_PLUS_MODEL_KEY,
  UFC_SINGLE_75_PLUS_MODEL_KEY,
  UFC_SINGLE_85_PLUS_MODEL_KEY,
  UFC_SINGLE_PRICE_DIFFERENCE_75_PLUS_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_VARIANTS,
  WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS,
  type PredictionModelKey,
  type PredictionModelVariant,
  type WinPercentageMultiModelKey,
} from "../data/supabasePredictions";
import {
  NRL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  NRL_SINGLE_PREDICTION_MODEL_VARIANTS,
  type NrlSinglePredictionModelKey,
} from "../data/supabaseNrlPredictions";
import {
  NPC_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  NPC_SINGLE_PREDICTION_MODEL_VARIANTS,
  type NpcSinglePredictionModelKey,
} from "../data/supabaseNpcPredictions";
import { BetCandidatesSection } from "./BetCandidatesSection";
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

const RACING_WIN_PERCENTAGE_MULTI_KEYS = [
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY,
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
  UFC_SINGLE_PRICE_DIFFERENCE_75_PLUS_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];
const PFL_WIN_PERCENTAGE_MULTI_KEYS = [
  PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  PFL_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  PFL_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];
const PFL_WIN_PERCENTAGE_SINGLE_KEYS = [
  PFL_SINGLE_65_PLUS_MODEL_KEY,
  PFL_SINGLE_75_PLUS_MODEL_KEY,
  PFL_SINGLE_85_PLUS_MODEL_KEY,
  PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  PFL_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  PFL_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
] satisfies WinPercentageMultiModelKey[];

/**
 * Shows current pre-race prediction signals without mixing in settled history.
 */
export function PredictionsScreen() {
  const [activeCashModelKey, setActiveCashModelKey] = useState<PredictionModelKey>(DEFAULT_PREDICTION_MODEL_KEY);
  const [activeSingleWinPercentageModelKey, setActiveSingleWinPercentageModelKey] =
    useState<PredictionModelKey>(SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY);
  const [activeNrlSingleModelKey, setActiveNrlSingleModelKey] =
    useState<NrlSinglePredictionModelKey>(NRL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY);
  const [activeNpcSingleModelKey, setActiveNpcSingleModelKey] =
    useState<NpcSinglePredictionModelKey>(NPC_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY);
  const [activeSport, setActiveSport] = useState<PredictionSport>("racing");
  const [activeFormat, setActiveFormat] = useState<PredictionFormat>("singles");
  const [activePredictionType, setActivePredictionType] = useState<CurrentPredictionType>("cash");
  const [activeWinPercentageMultiModelKey, setActiveWinPercentageMultiModelKey] =
    useState<WinPercentageMultiModelKey>(WIN_PERCENTAGE_MULTI_MODEL_KEY);
  const [multiBetModelKeys, setMultiBetModelKeys] = useState<PredictionModelKey[]>([]);
  const activeSingleWinPercentageModel = WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS.find((model) =>
    model.key === activeSingleWinPercentageModelKey)
    ?? WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS[0];
  const activeNrlSingleModel = NRL_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeNrlSingleModelKey)
    ?? NRL_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeNpcSingleModel = NPC_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeNpcSingleModelKey)
    ?? NPC_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeCashModel = CASH_PREDICTION_MODEL_VARIANTS.find((model) => model.key === activeCashModelKey)
    ?? CASH_PREDICTION_MODEL_VARIANTS[0];
  const activeWinPercentageModel = WIN_PERCENTAGE_MULTI_MODEL_VARIANTS.find((model) =>
    model.key === activeWinPercentageMultiModelKey)
    ?? WIN_PERCENTAGE_MULTI_MODEL_VARIANTS[0];
  const activeSingleModelKey = activePredictionType === "win_percentage"
    ? activeSingleWinPercentageModelKey
    : activeCashModelKey;
  const activeModelInfo = getActiveModelInfo({
    activeCashModel,
    activeFormat,
    activeNpcSingleModel,
    activeNrlSingleModel,
    activePredictionType,
    activeSingleWinPercentageModel,
    activeSport,
    activeWinPercentageModel,
  });

  function updateSport(value: PredictionSport) {
    setActiveSport(value);

    if (value === "ufc") {
      setActiveFormat("multis");
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY);
      return;
    }

    if (value === "nrl" || value === "npc") {
      setActiveFormat("singles");
      setActivePredictionType("win_percentage");
      return;
    }

    if (value === "pfl") {
      setActiveFormat("multis");
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY);
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
    } else if (activeSport === "pfl" && value === "singles") {
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(PFL_SINGLE_65_PLUS_MODEL_KEY);
    } else if (activeSport === "pfl" && value === "multis") {
      setActiveWinPercentageMultiModelKey(PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY);
    }
  }

  function updatePredictionType(value: CurrentPredictionType) {
    setActivePredictionType(value);

    if (value === "win_percentage") {
      setActiveWinPercentageMultiModelKey(activeSport === "ufc"
        ? activeFormat === "singles" ? UFC_SINGLE_65_PLUS_MODEL_KEY : UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY
        : activeSport === "pfl"
          ? activeFormat === "singles" ? PFL_SINGLE_65_PLUS_MODEL_KEY : PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY
        : WIN_PERCENTAGE_MULTI_MODEL_KEY);
    } else if (value === "placing") {
      setActiveWinPercentageMultiModelKey(PLACING_PERCENTAGE_MULTI_MODEL_KEY);
    }
  }

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

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Predictions</Text>
      <Text style={styles.heading}>Current prediction signals</Text>
      <Text style={styles.note}>
        Review today's current candidates by sport and prediction type. Settled outcomes and history live in Prediction History.
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
          activeModelKey={activeCashModelKey}
          models={CASH_PREDICTION_MODEL_VARIANTS}
          multiBetModelKeys={activeFormat === "multis" ? multiBetModelKeys : []}
          onChange={setActiveCashModelKey}
        />
      ) : null}

      {activeSport === "racing" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeSingleWinPercentageModelKey}
          models={WIN_PERCENTAGE_SINGLE_MODEL_VARIANTS}
          onChange={setActiveSingleWinPercentageModelKey}
        />
      ) : null}

      {activeSport === "nrl" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeNrlSingleModelKey}
          models={NRL_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={setActiveNrlSingleModelKey}
        />
      ) : null}

      {activeSport === "npc" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeNpcSingleModelKey}
          models={NPC_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={setActiveNpcSingleModelKey}
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

      {activeSport === "ufc" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={UFC_WIN_PERCENTAGE_SINGLE_KEYS}
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

      {activeSport === "pfl" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={PFL_WIN_PERCENTAGE_SINGLE_KEYS}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      {activeSport === "pfl" && activeFormat === "multis" && activePredictionType === "win_percentage" ? (
        <WinPercentageMultiModelTabs
          activeModelKey={activeWinPercentageMultiModelKey}
          includeModelKeys={PFL_WIN_PERCENTAGE_MULTI_KEYS}
          onChange={setActiveWinPercentageMultiModelKey}
          sport={activeSport}
        />
      ) : null}

      <View style={styles.modelInfo}>
        <Text style={styles.modelInfoTitle}>{activeModelInfo.label}</Text>
        <Text style={styles.modelInfoText}>{activeModelInfo.description}</Text>
        <Text style={styles.modelInfoDetail}>{activeModelInfo.detail}</Text>
      </View>

      {activeModelInfo.empty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{activeModelInfo.empty}</Text>
        </View>
      ) : null}

      <BetCandidatesSection
        npcSinglePredictionModelKey={activeNpcSingleModelKey}
        nrlSinglePredictionModelKey={activeNrlSingleModelKey}
        predictionFormat={activeFormat}
        predictionModelKey={activePredictionType === "cash" ? activeCashModelKey : activeSingleModelKey}
        predictionSport={activeSport}
        predictionType={activePredictionType}
        winPercentageMultiModelKey={activeWinPercentageMultiModelKey}
      />
    </View>
  );
}

type ActiveModelInfoInput = {
  activeCashModel: PredictionModelVariant;
  activeFormat: PredictionFormat;
  activeNpcSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeNrlSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activePredictionType: CurrentPredictionType;
  activeSingleWinPercentageModel: PredictionModelVariant;
  activeSport: PredictionSport;
  activeWinPercentageModel: {
    description: string;
    detail: string;
    label: string;
  };
};

/**
 * Returns the model card shown for the currently selected sport, format, and signal branch.
 */
function getActiveModelInfo({
  activeCashModel,
  activeFormat,
  activeNpcSingleModel,
  activeNrlSingleModel,
  activePredictionType,
  activeSingleWinPercentageModel,
  activeSport,
  activeWinPercentageModel,
}: ActiveModelInfoInput) {
  if (activeSport === "nrl" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future NRL prediction models.",
      detail: "NRL cash and same-game branches need source-backed prices and same-game market validation before they can be tracked.",
      empty: `No NRL ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `NRL ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "nrl") {
    return {
      description: activeNrlSingleModel.description,
      detail: activeNrlSingleModel.detail,
      label: activeNrlSingleModel.label,
    };
  }

  if (activeSport === "npc" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future NPC prediction models.",
      detail: "NPC cash and same-game branches need more source-backed prices and same-game market validation before they can be tracked.",
      empty: `No NPC ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `NPC ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "npc") {
    return {
      description: activeNpcSingleModel.description,
      detail: activeNpcSingleModel.detail,
      label: activeNpcSingleModel.label,
    };
  }

  if (activeSport === "ufc" && activePredictionType !== "win_percentage") {
    return {
      description: "This branch is reserved for future UFC prediction models.",
      detail: "The controls are present so UFC can grow into the same Singles and Multis structure as Racing.",
      empty: `No UFC ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `UFC ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "ufc") {
    return {
      description: activeFormat === "singles"
        ? "Shows current UFC favourites as individual win-percentage singles from the selected historical bucket model."
        : activeWinPercentageModel.description,
      detail: activeFormat === "singles"
        ? `${activeWinPercentageModel.detail} Each eligible Head to Head favourite is shown as a separate current single candidate.`
        : activeWinPercentageModel.detail,
      label: activeFormat === "singles"
        ? `${activeWinPercentageModel.label} singles`
        : activeWinPercentageModel.label,
    };
  }

  if (activeSport === "pfl" && activePredictionType !== "win_percentage") {
    return {
      description: "This branch is reserved for future PFL prediction models.",
      detail: "The controls are present so PFL can grow into the same Singles and Multis structure as UFC.",
      empty: `No PFL ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `PFL ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "pfl") {
    return {
      description: activeFormat === "singles"
        ? "Shows current PFL favourites as individual win-percentage singles when a reviewed PFL card is priced."
        : activeWinPercentageModel.description,
      detail: activeFormat === "singles"
        ? `${activeWinPercentageModel.detail} Each eligible Head to Head favourite is matched to the reviewed PFL event allow-list before it is shown as a separate current single candidate.`
        : `${activeWinPercentageModel.detail} PFL multis only appear when enough current fixed-win fights match one reviewed PFL card.`,
      label: activeFormat === "singles"
        ? `${activeWinPercentageModel.label} singles`
        : activeWinPercentageModel.label,
    };
  }

  if (activePredictionType === "cash") {
    return {
      description: activeCashModel.description,
      detail: activeFormat === "multis"
        ? `${activeCashModel.detail} The selected model is tracked as a cash multi when enough eligible legs exist.`
        : activeCashModel.detail,
      label: activeCashModel.label,
    };
  }

  if (activePredictionType === "win_percentage" && activeFormat === "singles") {
    return {
      description: activeSingleWinPercentageModel.description,
      detail: activeSingleWinPercentageModel.detail,
      label: activeSingleWinPercentageModel.label,
    };
  }

  if (activePredictionType === "win_percentage") {
    return {
      description: activeWinPercentageModel.description,
      detail: activeWinPercentageModel.detail,
      label: activeWinPercentageModel.label,
    };
  }

  if (activeFormat === "multis") {
    return {
      description: activeWinPercentageModel.description,
      detail: activeWinPercentageModel.detail,
      label: activeWinPercentageModel.label,
    };
  }

  return {
    description: "Shows current favourite place signals from stored place-return and place-rate history.",
    detail: "Place eligibility uses country-aware market depth: AU/NZ 5-7 starters top 2, 8+ top 3; HK 4-6 top 2, 7+ top 3.",
    label: "Placing singles",
  };
}

/**
 * Converts prediction type ids into short labels for empty-state copy.
 */
function getPredictionTypeLabel(type: CurrentPredictionType) {
  if (type === "win_percentage") {
    return "Win %";
  }

  return type === "placing" ? "Placing" : "Cash";
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#0d9488",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  heading: {
    color: "#101828",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 4,
  },
  modelInfo: {
    backgroundColor: "#f8fafc",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  modelInfoDetail: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 18,
  },
  modelInfoText: {
    color: "#475467",
    fontSize: 13,
    lineHeight: 19,
  },
  modelInfoTitle: {
    color: "#101828",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyState: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  emptyStateText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: "#475467",
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
});
