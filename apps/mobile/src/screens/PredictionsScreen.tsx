import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  DEFAULT_PREDICTION_MODEL_KEY,
  fetchMultiBetRecommendationModelKeys,
  hasSupabasePredictionsConfig,
  PREDICTION_MODEL_VARIANTS,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_VARIANTS,
  type PredictionModelKey,
  type WinPercentageMultiModelKey,
} from "../data/supabasePredictions";
import { BetCandidatesSection } from "./BetCandidatesSection";
import {
  PredictionModelTabs,
  PredictionSportTabs,
  PredictionTypeTabs,
  WinPercentageMultiModelTabs,
  type CurrentPredictionType,
  type PredictionSport,
} from "./PredictionControls";

/**
 * Shows current pre-race prediction signals without mixing in settled history.
 */
export function PredictionsScreen() {
  const [activeModelKey, setActiveModelKey] = useState<PredictionModelKey>(DEFAULT_PREDICTION_MODEL_KEY);
  const [activeSport, setActiveSport] = useState<PredictionSport>("racing");
  const [activePredictionType, setActivePredictionType] = useState<CurrentPredictionType>("cash");
  const [activeWinPercentageMultiModelKey, setActiveWinPercentageMultiModelKey] =
    useState<WinPercentageMultiModelKey>(WIN_PERCENTAGE_MULTI_MODEL_KEY);
  const [multiBetModelKeys, setMultiBetModelKeys] = useState<PredictionModelKey[]>([]);
  const activeModel = PREDICTION_MODEL_VARIANTS.find((model) => model.key === activeModelKey)
    ?? PREDICTION_MODEL_VARIANTS[0];
  const activeWinPercentageModel = WIN_PERCENTAGE_MULTI_MODEL_VARIANTS.find((model) =>
    model.key === activeWinPercentageMultiModelKey)
    ?? WIN_PERCENTAGE_MULTI_MODEL_VARIANTS[0];
  const shouldShowCashModel = activePredictionType === "cash";

  function updateSport(value: PredictionSport) {
    setActiveSport(value);

    if (value === "ufc") {
      setActivePredictionType("win_percentage");
      setActiveWinPercentageMultiModelKey(UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY);
      return;
    }

    setActiveWinPercentageMultiModelKey(WIN_PERCENTAGE_MULTI_MODEL_KEY);
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

      {activeSport === "racing" ? (
        <PredictionTypeTabs
          activeType={activePredictionType}
          onChange={setActivePredictionType}
        />
      ) : null}

      {activeSport === "racing" && shouldShowCashModel ? (
        <>
          <PredictionModelTabs
            activeModelKey={activeModelKey}
            multiBetModelKeys={multiBetModelKeys}
            onChange={setActiveModelKey}
          />
          <View style={styles.modelInfo}>
            <Text style={styles.modelInfoTitle}>{activeModel.label}</Text>
            <Text style={styles.modelInfoText}>{activeModel.description}</Text>
            <Text style={styles.modelInfoDetail}>{activeModel.detail}</Text>
          </View>
        </>
      ) : activePredictionType === "win_percentage" ? (
        <>
          <WinPercentageMultiModelTabs
            activeModelKey={activeWinPercentageMultiModelKey}
            onChange={setActiveWinPercentageMultiModelKey}
            sport={activeSport}
          />
          <View style={styles.modelInfo}>
            <Text style={styles.modelInfoTitle}>{activeWinPercentageModel.label}</Text>
            <Text style={styles.modelInfoText}>{activeWinPercentageModel.description}</Text>
            <Text style={styles.modelInfoDetail}>{activeWinPercentageModel.detail}</Text>
          </View>
        </>
      ) : (
        <View style={styles.modelInfo}>
          <Text style={styles.modelInfoTitle}>Placing predictions</Text>
          <Text style={styles.modelInfoText}>
            Shows current favourite place signals from stored place-return and place-rate history.
          </Text>
          <Text style={styles.modelInfoDetail}>
            Place eligibility uses country-aware market depth: AU/NZ 5-7 starters top 2, 8+ top 3; HK 4-6 top 2, 7+ top 3.
          </Text>
        </View>
      )}

      <BetCandidatesSection
        predictionModelKey={activeModelKey}
        predictionSport={activeSport}
        predictionType={activePredictionType}
        winPercentageMultiModelKey={activeWinPercentageMultiModelKey}
      />
    </View>
  );
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
