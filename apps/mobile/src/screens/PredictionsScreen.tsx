import { useCombatPredictionSelections, type CombatSelectionControl } from "../navigation/useCombatPredictionSelections";
import type { FootballHistoryVariationKey } from "../data/supabaseFootballTrial";
import { CombinedFootballPredictions } from "./CombinedFootballPredictions";
import { CombatLeagueSections } from "./CombatLeagueSections";
import type { FootballModelFamily } from "../data/footballPredictionReader";
import { getPredictionLeague, type SportScope } from "../navigation/sportLeagueScope";
import { UnavailableSportScope } from "./UnavailableSportScope";
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
  UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY,
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
import {
  UCL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  UCL_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseUclPredictions";
import {
  EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  EPL_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseEplPredictions";
import {
  LALIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseLaligaPredictions";

import {
  NATIONSLEAGUE_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseNationsleaguePredictions";
import {
  BUNDESLIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseBundesligaPredictions";
import {
  SERIEA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseSerieaPredictions";
import {
  LIGUE1_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseLigue1Predictions";
import {
  MLS_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  MLS_SINGLE_PREDICTION_MODEL_VARIANTS,
} from "../data/supabaseMlsPredictions";
import { BetCandidatesSection } from "./BetCandidatesSection";
import {
  PredictionFormatTabs,
  PredictionModelTabs,
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
  UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY,
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
export function PredictionsScreen({ scope, onSelectLeague }: { scope: SportScope; onSelectLeague: (league: string) => void }) {
  const combatControl = useCombatPredictionSelections();
  const [footballFormat, setFootballFormat] = useState<PredictionFormat>("singles");
  const [footballVariation, setFootballVariation] = useState<FootballHistoryVariationKey>("gap_exact");
  const sport = getPredictionLeague(scope);
  if (scope.group === "football") return <CombinedFootballPredictions
    format={footballFormat} onFormatChange={setFootballFormat} league={scope.league === "all_football" ? null : scope.league} variationKey={footballVariation} onVariationChange={setFootballVariation} onSelectLeague={onSelectLeague} />;
  if (scope.league === "all_combat_sports") return <CombatLeagueSections onSelectLeague={onSelectLeague}
    renderLeague={(league) => <LeaguePredictionsScreen activeSport={league} combat={combatControl(league)} allowAccountActions={false} />} />;
  if (!sport) return <UnavailableSportScope scope={scope} view="predictions" />;
  return <LeaguePredictionsScreen key={scope.group === "combat_sports" ? sport : scope.group} activeSport={sport} combat={sport === "ufc" || sport === "pfl" ? combatControl(sport) : undefined} />;
}

// Reuse the existing league readers with a real league identity and valid defaults for its model family.
function LeaguePredictionsScreen({ activeSport, footballModelFamily = "fixed_win_percentage", onFootballModelChange, allowAccountActions = true, combat, footballFormat, onFootballFormatChange }: {
  combat?: CombatSelectionControl; footballFormat?: PredictionFormat; onFootballFormatChange?: (format: PredictionFormat) => void;
  activeSport: PredictionSport; footballModelFamily?: FootballModelFamily; onFootballModelChange?: (family: FootballModelFamily) => void; allowAccountActions?: boolean;
}) {
  const [activeCashModelKey, setActiveCashModelKey] = useState<PredictionModelKey>(DEFAULT_PREDICTION_MODEL_KEY);
  const [activeSingleWinPercentageModelKey, setActiveSingleWinPercentageModelKey] =
    useState<PredictionModelKey>(SINGLE_WIN_PERCENTAGE_65_PLUS_MODEL_KEY);
  const [activeNrlSingleModelKey, setActiveNrlSingleModelKey] =
    useState<NrlSinglePredictionModelKey>(NRL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY);
  const [activeNpcSingleModelKey, setActiveNpcSingleModelKey] =
    useState<NpcSinglePredictionModelKey>(NPC_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY);
  const activeUclSingleModelKey = UCL_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? UCL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeEplSingleModelKey = EPL_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? EPL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeLaligaSingleModelKey = LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? LALIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;

  const activeNationsleagueSingleModelKey = NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? NATIONSLEAGUE_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeBundesligaSingleModelKey = BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? BUNDESLIGA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeSerieaSingleModelKey = SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? SERIEA_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeLigue1SingleModelKey = LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? LIGUE1_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const activeMlsSingleModelKey = MLS_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key.endsWith(`_${footballModelFamily}_single_v1`))?.key ?? MLS_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY;
  const [localFormat, setLocalFormat] = useState<PredictionFormat>(activeSport === "ufc" || activeSport === "pfl" ? "multis" : "singles");
  const [activePredictionType, setActivePredictionType] = useState<CurrentPredictionType>(activeSport === "racing" ? "cash" : "win_percentage");
  const [localWinPercentageMultiModelKey, setLocalWinPercentageMultiModelKey] =
    useState<WinPercentageMultiModelKey>(activeSport === "ufc" ? UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY : activeSport === "pfl" ? PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY : WIN_PERCENTAGE_MULTI_MODEL_KEY);
  const activeFormat = combat?.selection.format ?? footballFormat ?? localFormat;
  const activeWinPercentageMultiModelKey = combat?.selection.model ?? localWinPercentageMultiModelKey;

  // Preserve the active family's format when drilling between combined and individual league views.
  function setActiveFormat(value: PredictionFormat) {
    if (combat) combat.update((current) => ({ ...current, format: value }));
    else if (onFootballFormatChange) onFootballFormatChange(value);
    else setLocalFormat(value);
  }

  // Keep combat model identity attached to its league, while racing retains its own local models.
  function setActiveWinPercentageMultiModelKey(value: WinPercentageMultiModelKey) {
    if (combat) combat.update((current) => ({ ...current, model: value }));
    else setLocalWinPercentageMultiModelKey(value);
  }
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
  const activeUclSingleModel = UCL_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeUclSingleModelKey)
    ?? UCL_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeEplSingleModel = EPL_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeEplSingleModelKey)
    ?? EPL_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeLaligaSingleModel = LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeLaligaSingleModelKey)
    ?? LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS[0];

  const activeNationsleagueSingleModel = NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeNationsleagueSingleModelKey)
    ?? NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeBundesligaSingleModel = BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeBundesligaSingleModelKey)
    ?? BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeSerieaSingleModel = SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeSerieaSingleModelKey)
    ?? SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeLigue1SingleModel = LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeLigue1SingleModelKey)
    ?? LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS[0];
  const activeMlsSingleModel = MLS_SINGLE_PREDICTION_MODEL_VARIANTS.find((model) =>
    model.key === activeMlsSingleModelKey)
    ?? MLS_SINGLE_PREDICTION_MODEL_VARIANTS[0];
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
    activeBundesligaSingleModel,
    activeEplSingleModel,
    activeFormat,
    activeLaligaSingleModel,
    activeNationsleagueSingleModel,
    activeLigue1SingleModel,
    activeMlsSingleModel,
    activeNpcSingleModel,
    activeNrlSingleModel,
    activeSerieaSingleModel,
    activeUclSingleModel,
    activePredictionType,
    activeSingleWinPercentageModel,
    activeSport,
    activeWinPercentageModel,
  });

  // Carry the same football model family into another league using that league's real model key.
  function updateFootballModel(value: string) {
    onFootballModelChange?.(value.includes("_goal_scorer_") ? "goal_scorer_percentage" : "fixed_win_percentage");
  }

  // Switch format while selecting compatible combat-sport model defaults.
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

      <PredictionFormatTabs
        activeFormat={activeFormat}
        onChange={updateFormat}
      />

      <PredictionTypeTabs
        sport={activeSport}
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

      {activeSport === "ucl" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeUclSingleModelKey}
          models={UCL_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "epl" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeEplSingleModelKey}
          models={EPL_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "nationsleague" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeNationsleagueSingleModelKey}
          models={NATIONSLEAGUE_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "laliga" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeLaligaSingleModelKey}
          models={LALIGA_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "bundesliga" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeBundesligaSingleModelKey}
          models={BUNDESLIGA_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "seriea" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeSerieaSingleModelKey}
          models={SERIEA_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "ligue1" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeLigue1SingleModelKey}
          models={LIGUE1_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
        />
      ) : null}

      {activeSport === "mls" && activeFormat === "singles" && activePredictionType === "win_percentage" ? (
        <PredictionModelTabs
          activeModelKey={activeMlsSingleModelKey}
          models={MLS_SINGLE_PREDICTION_MODEL_VARIANTS}
          onChange={updateFootballModel}
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
        key={activeSport}
        allowAccountActions={allowAccountActions}
        npcSinglePredictionModelKey={activeNpcSingleModelKey}
        bundesligaSinglePredictionModelKey={activeBundesligaSingleModelKey}
        eplSinglePredictionModelKey={activeEplSingleModelKey}
        laligaSinglePredictionModelKey={activeLaligaSingleModelKey}
        nationsleagueSinglePredictionModelKey={activeNationsleagueSingleModelKey}
        ligue1SinglePredictionModelKey={activeLigue1SingleModelKey}
        mlsSinglePredictionModelKey={activeMlsSingleModelKey}
        nrlSinglePredictionModelKey={activeNrlSingleModelKey}
        serieaSinglePredictionModelKey={activeSerieaSingleModelKey}
        predictionFormat={activeFormat}
        predictionModelKey={activePredictionType === "cash" ? activeCashModelKey : activeSingleModelKey}
        predictionSport={activeSport}
        predictionType={activePredictionType}
        uclSinglePredictionModelKey={activeUclSingleModelKey}
        winPercentageMultiModelKey={activeWinPercentageMultiModelKey}
      />
    </View>
  );
}

type ActiveModelInfoInput = {
  activeCashModel: PredictionModelVariant;
  activeBundesligaSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeEplSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeFormat: PredictionFormat;
  activeLaligaSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeNationsleagueSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeLigue1SingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeMlsSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
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
  activeSerieaSingleModel: {
    description: string;
    detail: string;
    label: string;
  };
  activeUclSingleModel: {
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
  activeBundesligaSingleModel,
  activeEplSingleModel,
  activeFormat,
  activeLaligaSingleModel,
  activeNationsleagueSingleModel,
  activeLigue1SingleModel,
  activeMlsSingleModel,
  activeNpcSingleModel,
  activeNrlSingleModel,
  activeSerieaSingleModel,
  activeUclSingleModel,
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

  if (activeSport === "ucl" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future UCL prediction models.",
      detail: "UCL cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No UCL ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `UCL ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "ucl") {
    return {
      description: activeUclSingleModel.description,
      detail: activeUclSingleModel.detail,
      label: activeUclSingleModel.label,
    };
  }

  if (activeSport === "epl" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future EPL prediction models.",
      detail: "EPL cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No EPL ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `EPL ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "epl") {
    return {
      description: activeEplSingleModel.description,
      detail: activeEplSingleModel.detail,
      label: activeEplSingleModel.label,
    };
  }

  if (activeSport === "laliga" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future La Liga prediction models.",
      detail: "La Liga cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No La Liga ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `La Liga ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "nationsleague" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future UEFA Nations League prediction models.",
      detail: "UEFA Nations League cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No UEFA Nations League ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `UEFA Nations League ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "laliga") {
    return {
      description: activeLaligaSingleModel.description,
      detail: activeLaligaSingleModel.detail,
      label: activeLaligaSingleModel.label,
    };
  }

  if (activeSport === "nationsleague") {
    return {
      description: activeNationsleagueSingleModel.description,
      detail: activeNationsleagueSingleModel.detail,
      label: activeNationsleagueSingleModel.label,
    };
  }

  if (activeSport === "bundesliga" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future Bundesliga prediction models.",
      detail: "Bundesliga cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No Bundesliga ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `Bundesliga ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "bundesliga") {
    return {
      description: activeBundesligaSingleModel.description,
      detail: activeBundesligaSingleModel.detail,
      label: activeBundesligaSingleModel.label,
    };
  }

  if (activeSport === "seriea" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future Serie A prediction models.",
      detail: "Serie A cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No Serie A ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `Serie A ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "seriea") {
    return {
      description: activeSerieaSingleModel.description,
      detail: activeSerieaSingleModel.detail,
      label: activeSerieaSingleModel.label,
    };
  }

  if (activeSport === "ligue1" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future Ligue 1 prediction models.",
      detail: "Ligue 1 cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No Ligue 1 ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `Ligue 1 ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "ligue1") {
    return {
      description: activeLigue1SingleModel.description,
      detail: activeLigue1SingleModel.detail,
      label: activeLigue1SingleModel.label,
    };
  }

  if (activeSport === "mls" && (activeFormat !== "singles" || activePredictionType !== "win_percentage")) {
    return {
      description: "This branch is reserved for future MLS prediction models.",
      detail: "MLS cash and multi branches need more source-backed calibration before they can be tracked.",
      empty: `No MLS ${activeFormat === "singles" ? "single" : "multi"} ${getPredictionTypeLabel(activePredictionType).toLowerCase()} models are tracked yet.`,
      label: `MLS ${getPredictionTypeLabel(activePredictionType)} ${activeFormat}`,
    };
  }

  if (activeSport === "mls") {
    return {
      description: activeMlsSingleModel.description,
      detail: activeMlsSingleModel.detail,
      label: activeMlsSingleModel.label,
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
