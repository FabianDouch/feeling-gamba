import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RaceDisciplineIcon } from "../components/RaceDisciplineIcon";
import { useAuth } from "../data/authSession";
import {
  DEFAULT_PREDICTION_MODEL_KEY,
  PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  PFL_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  PFL_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  PFL_SINGLE_65_PLUS_MODEL_KEY,
  PFL_SINGLE_75_PLUS_MODEL_KEY,
  PFL_SINGLE_85_PLUS_MODEL_KEY,
  PLACING_PERCENTAGE_MULTI_MODEL_KEY,
  SINGLE_WIN_PERCENTAGE_60_PLUS_MODEL_KEY,
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  UFC_SINGLE_65_PLUS_MODEL_KEY,
  UFC_SINGLE_75_PLUS_MODEL_KEY,
  UFC_SINGLE_85_PLUS_MODEL_KEY,
  UFC_SINGLE_PRICE_DIFFERENCE_75_PLUS_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_MULTI_MODEL_KEY,
  isPflPercentageMultiModel,
  isUfcPercentageMultiModel,
  type PredictionModelKey,
  type WinPercentageMultiModelKey,
} from "../data/supabasePredictions";
import type { CurrentPredictionType, PredictionFormat, PredictionSport } from "./PredictionControls";
import {
  type BetCandidate,
  type RecommendationPayload,
  type RecommendationRace,
  SOURCE_TIME_ZONE,
  type UfcSinglePredictionCandidate,
  type UfcWinPercentageMultiModelRun,
  type UfcMultiRecommendation,
} from "../data/promotionPayload";
import {
  fetchLatestPredictionSnapshot,
  hasPredictionRefreshEndpoint,
  hasSupabasePredictionCacheConfig,
  requestPredictionRefresh,
} from "../data/supabasePromotions";
import {
  fetchCurrentNrlSinglePredictions,
  hasSupabaseNrlPredictionsConfig,
  NRL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  type NrlSinglePredictionItem,
  type NrlSinglePredictionModelKey,
  type NrlSinglePredictionsResult,
} from "../data/supabaseNrlPredictions";
import {
  fetchCurrentNpcSinglePredictions,
  hasSupabaseNpcPredictionsConfig,
  NPC_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  type NpcSinglePredictionItem,
  type NpcSinglePredictionModelKey,
  type NpcSinglePredictionsResult,
} from "../data/supabaseNpcPredictions";
import {
  fetchLockedWinPercentageMulti,
  saveLockedWinPercentageMulti,
  type LockedWinPercentageMultiRecommendation,
} from "../data/userLockedMultiRecommendations";
import {
  createLockedUfcMultiInput,
  fetchLockedUfcMulti,
  saveLockedUfcMulti,
  type LockedUfcMultiRecommendation,
} from "../data/userLockedUfcMultiRecommendations";
import {
  fetchLockedCurrentPrediction,
  saveLockedCurrentPrediction,
  type LockedCurrentPrediction,
} from "../data/userLockedCurrentPredictions";
import {
  deleteUserFavouritePredictionModel,
  fetchUserFavouritePredictionModels,
  isFavouritePredictionModel,
  registerPredictionPushToken,
  saveUserFavouritePredictionModel,
  type UserFavouritePredictionModel,
} from "../data/userPredictionNotifications";
import {
  fetchUserRaceBets,
  formatBookmaker,
  isUserRaceBetLogged,
  saveUserRaceBet,
  type UserRaceBet,
  type UserRaceBetInput,
} from "../data/userRaceBets";

const PROMOTION_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const PREDICTION_FINALISATION_BUFFER_MS = 15 * 60 * 1000;

type BetCandidateStatus = "empty" | "error" | "loading" | "supabase" | "unconfigured";

type BetCandidatesSectionProps = {
  npcSinglePredictionModelKey?: NpcSinglePredictionModelKey;
  nrlSinglePredictionModelKey?: NrlSinglePredictionModelKey;
  predictionFormat?: PredictionFormat;
  predictionModelKey?: PredictionModelKey;
  predictionSport?: PredictionSport;
  predictionType?: CurrentPredictionType;
  winPercentageMultiModelKey?: WinPercentageMultiModelKey;
};

type MultiBetRecommendation = {
  combinedFixedWinPrice: number | null;
  legs: BetCandidate[];
  tone: "neutral" | "positive";
};

type PredictionFinalisationStatus = {
  finalised: boolean;
  finalisesAt: string | null;
  firstStartAt: string | null;
  sportLabel: string;
};

const MULTI_BET_MAX_LEGS = 5;
const WIN_PERCENTAGE_THRESHOLD_MAX_LEGS = 10;
const PLACING_PERCENTAGE_MAX_LEGS = 8;
const MULTI_BET_MIN_LEGS = 2;
const WIN_PERCENTAGE_MULTI_MODEL_LABELS: Partial<Record<WinPercentageMultiModelKey, string>> = {
  [UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY]: "UFC favourite price",
  [UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY]: "UFC other fighter price",
  [UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY]: "UFC other fighter price top 6",
  [UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY]: "UFC price difference",
  [UFC_SINGLE_65_PLUS_MODEL_KEY]: "65%+ win",
  [UFC_SINGLE_75_PLUS_MODEL_KEY]: "75%+ win",
  [UFC_SINGLE_85_PLUS_MODEL_KEY]: "85%+ win",
  [UFC_SINGLE_PRICE_DIFFERENCE_75_PLUS_MODEL_KEY]: "Price diff 75%+",
  [PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY]: "PFL favourite price",
  [PFL_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY]: "PFL other fighter price",
  [PFL_PRICE_DIFFERENCE_MULTI_MODEL_KEY]: "PFL price difference",
  [PFL_SINGLE_65_PLUS_MODEL_KEY]: "65%+ win",
  [PFL_SINGLE_75_PLUS_MODEL_KEY]: "75%+ win",
  [PFL_SINGLE_85_PLUS_MODEL_KEY]: "85%+ win",
};

/**
 * Shows current source-backed candidate races for one selected prediction family.
 */
export function BetCandidatesSection({
  npcSinglePredictionModelKey = NPC_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  nrlSinglePredictionModelKey = NRL_FIXED_WIN_PERCENTAGE_SINGLE_MODEL_KEY,
  predictionFormat = "singles",
  predictionModelKey = DEFAULT_PREDICTION_MODEL_KEY,
  predictionSport = "racing",
  predictionType = "cash",
  winPercentageMultiModelKey = WIN_PERCENTAGE_MULTI_MODEL_KEY,
}: BetCandidatesSectionProps) {
  const { isSigningIn, signInWithGoogle, user } = useAuth();
  const [payload, setPayload] = useState<RecommendationPayload | null>(null);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<BetCandidateStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRequestingRefresh, setIsRequestingRefresh] = useState(false);
  const [trackedBets, setTrackedBets] = useState<UserRaceBet[]>([]);
  const [trackedBetMessage, setTrackedBetMessage] = useState<string | null>(null);
  const [trackedBetError, setTrackedBetError] = useState<string | null>(null);
  const [lockedWinPercentageMulti, setLockedWinPercentageMulti] =
    useState<LockedWinPercentageMultiRecommendation | null>(null);
  const [lockedUfcMultis, setLockedUfcMultis] = useState<Record<string, LockedUfcMultiRecommendation>>({});
  const [nrlPredictions, setNrlPredictions] = useState<NrlSinglePredictionsResult | null>(null);
  const [nrlPredictionError, setNrlPredictionError] = useState<string | null>(null);
  const [isLoadingNrlPredictions, setIsLoadingNrlPredictions] = useState(false);
  const [npcPredictions, setNpcPredictions] = useState<NpcSinglePredictionsResult | null>(null);
  const [npcPredictionError, setNpcPredictionError] = useState<string | null>(null);
  const [isLoadingNpcPredictions, setIsLoadingNpcPredictions] = useState(false);
  const [lockedMultiMessage, setLockedMultiMessage] = useState<string | null>(null);
  const [lockedMultiError, setLockedMultiError] = useState<string | null>(null);
  const [isLockingWinPercentageMulti, setIsLockingWinPercentageMulti] = useState(false);
  const [lockingUfcCardId, setLockingUfcCardId] = useState<string | null>(null);
  const [lockedCurrentPrediction, setLockedCurrentPrediction] = useState<LockedCurrentPrediction | null>(null);
  const [isLockingCurrentPrediction, setIsLockingCurrentPrediction] = useState(false);
  const [lockedCurrentPredictionMessage, setLockedCurrentPredictionMessage] = useState<string | null>(null);
  const [lockedCurrentPredictionError, setLockedCurrentPredictionError] = useState<string | null>(null);
  const [favouritePredictionModels, setFavouritePredictionModels] = useState<UserFavouritePredictionModel[]>([]);
  const [isSavingPredictionNotification, setIsSavingPredictionNotification] = useState(false);
  const [predictionNotificationMessage, setPredictionNotificationMessage] = useState<string | null>(null);
  const [predictionNotificationError, setPredictionNotificationError] = useState<string | null>(null);
  const [selectedDisciplineCode, setSelectedDisciplineCode] = useState<string | null>(null);
  const betCandidateScan = payload?.betBackCandidates ?? null;
  const selectedModelRun = betCandidateScan?.models?.find((model) => model.key === predictionModelKey) ?? null;
  const selectedModelKey = selectedModelRun?.key ?? DEFAULT_PREDICTION_MODEL_KEY;
  const betCandidates = selectedModelRun?.candidates ?? betCandidateScan?.candidates ?? [];
  const placingCandidatePool = betCandidateScan?.placingCandidates ?? betCandidates;
  const winPercentageMultiCandidatePool = getWinPercentageMultiCandidatePool(betCandidateScan, betCandidates);
  const isUfcWinPercentageMulti = isUfcPercentageMultiModel(winPercentageMultiModelKey);
  const isPflWinPercentageModel = isPflPercentageMultiModel(winPercentageMultiModelKey);
  const activeUfcModelRun = payload?.ufcWinPercentageMultis?.models?.find((model) =>
    model.key === winPercentageMultiModelKey) ?? null;
  const activePflModelRun = payload?.pflWinPercentageMultis?.models?.find((model) =>
    model.key === winPercentageMultiModelKey) ?? null;
  const candidateGroups = groupBetCandidatesByCountryAndDiscipline(betCandidates, selectedModelKey);
  const multiBetRecommendation = buildMultiBetRecommendation(betCandidates, selectedModelKey);
  const placingRecommendations = buildPlacingRecommendations(placingCandidatePool);
  const winPercentageSingleCandidates = getWinPercentageSingleCandidates(
    winPercentageMultiCandidatePool,
    predictionModelKey,
  );
  const winPercentageMultiRecommendation = isUfcWinPercentageMulti || isPflWinPercentageModel
    ? null
    : buildPercentageMultiBetRecommendation(
      isPlacingPercentageMultiModel(winPercentageMultiModelKey)
        ? placingCandidatePool
        : winPercentageMultiCandidatePool,
      winPercentageMultiModelKey,
    );
  const displayedWinPercentageMultiRecommendation = lockedWinPercentageMulti
    ? createRecommendationFromLockedWinPercentageMulti(lockedWinPercentageMulti)
    : winPercentageMultiRecommendation;
  const activeCandidateGroup = candidateGroups.find((group) => group.code === selectedDisciplineCode)
    ?? candidateGroups[0]
    ?? null;
  const modelScoreLabel = "Cash avg score";
  const activeSnapshotGeneratedAt = predictionSport === "ufc"
    ? payload?.ufcGeneratedAt ?? snapshotGeneratedAt
    : predictionSport === "pfl"
      ? payload?.pflGeneratedAt ?? snapshotGeneratedAt
    : snapshotGeneratedAt;
  const cacheAgeMs = activeSnapshotGeneratedAt ? Date.now() - new Date(activeSnapshotGeneratedAt).valueOf() : null;
  const predictionWindowClosedNow = isPredictionWindowClosedNow(payload?.predictionWindow);
  const finalisationStatus = getPredictionFinalisationStatus({
    npcPredictions,
    nrlPredictions,
    payload,
    predictionSport,
  });
  const currentPredictionModel = getCurrentPredictionModel({
    npcSinglePredictionModelKey,
    nrlSinglePredictionModelKey,
    predictionFormat,
    predictionModelKey,
    predictionSport,
    predictionType,
    winPercentageMultiModelKey,
  });
  const currentPredictionFavouriteKey = {
    modelKey: currentPredictionModel,
    predictionFormat,
    predictionSport,
    predictionType,
  };
  const currentPredictionNotificationEnabled = isFavouritePredictionModel(
    favouritePredictionModels,
    currentPredictionFavouriteKey,
  );
  const currentPredictionSourceDate = predictionSport === "nrl"
    ? nrlPredictions?.sourceDate ?? null
    : predictionSport === "npc"
      ? npcPredictions?.sourceDate ?? null
    : payload?.sourceDate ?? null;
  const currentPredictionGeneratedAt = predictionSport === "nrl"
    ? nrlPredictions?.generatedAt ?? null
    : predictionSport === "npc"
      ? npcPredictions?.generatedAt ?? null
    : activeSnapshotGeneratedAt;
  const currentPredictionGeneratedAtNz = predictionSport === "nrl"
    ? null
    : predictionSport === "npc"
      ? null
      : predictionSport === "ufc"
        ? payload?.ufcGeneratedAtNz ?? payload?.generatedAtNz ?? null
        : predictionSport === "pfl"
          ? payload?.pflGeneratedAtNz ?? payload?.generatedAtNz ?? null
          : payload?.generatedAtNz ?? null;
  const currentPredictionLockDisabledReason = getCurrentPredictionLockDisabledReason({
    finalisesAt: finalisationStatus.finalisesAt,
    hasCurrentView: Boolean(predictionSport === "nrl" ? nrlPredictions : predictionSport === "npc" ? npcPredictions : payload),
    isLocked: Boolean(lockedCurrentPrediction),
    isSignedIn: Boolean(user),
    sourceDate: currentPredictionSourceDate,
  });
  const sourceDate = payload?.sourceDate ?? null;
  const racingLockCutoffAt = getRacingLockCutoffAt(payload);
  const candidatesAreStale = Boolean(payload)
    && !predictionWindowClosedNow
    && isSnapshotStale(snapshotGeneratedAt);
  const statusLabel = status === "supabase"
    ? "Loaded from Supabase cache"
    : status === "loading"
      ? isRequestingRefresh ? "Refreshing candidates" : "Checking Supabase cache"
      : status === "unconfigured"
        ? "Supabase candidate cache is not configured"
        : status === "empty"
          ? "No Supabase candidate snapshot available"
          : "Supabase candidate cache unavailable";
  const sectionTitle = getPredictionTypeHeading(predictionType, predictionFormat);
  const unsupportedBranchMessage = getUnsupportedPredictionBranchMessage({
    predictionFormat,
    predictionSport,
    predictionType,
  });

  useEffect(() => {
    let isActive = true;

    async function loadFavouritePredictionModels() {
      if (!user) {
        setFavouritePredictionModels([]);
        return;
      }

      try {
        const favourites = await fetchUserFavouritePredictionModels();

        if (isActive) {
          setFavouritePredictionModels(favourites);
        }
      } catch (error) {
        if (isActive) {
          setPredictionNotificationError(error instanceof Error ? error.message : "Prediction notification favourites failed to load.");
        }
      }
    }

    loadFavouritePredictionModels();

    return () => {
      isActive = false;
    };
  }, [user]);

  useEffect(() => {
    setPredictionNotificationMessage(null);
    setPredictionNotificationError(null);
  }, [currentPredictionModel, predictionFormat, predictionSport, predictionType]);

  async function toggleCurrentPredictionNotification() {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    try {
      setIsSavingPredictionNotification(true);
      setPredictionNotificationError(null);
      setPredictionNotificationMessage(null);

      if (currentPredictionNotificationEnabled) {
        await deleteUserFavouritePredictionModel(currentPredictionFavouriteKey);
        setFavouritePredictionModels((current) => current.filter((favourite) =>
          !isFavouritePredictionModel([favourite], currentPredictionFavouriteKey)));
        setPredictionNotificationMessage("Finalised notification removed for this model.");
        return;
      }

      await registerPredictionPushToken();
      await saveUserFavouritePredictionModel(currentPredictionFavouriteKey);
      setFavouritePredictionModels(await fetchUserFavouritePredictionModels());
      setPredictionNotificationMessage("You will be notified when this model finalises with an active prediction.");
    } catch (error) {
      setPredictionNotificationError(error instanceof Error ? error.message : "Could not update prediction notifications.");
    } finally {
      setIsSavingPredictionNotification(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadNrlPredictions() {
      if (predictionSport !== "nrl") {
        return;
      }

      if (!hasSupabaseNrlPredictionsConfig) {
        setNrlPredictions(null);
        setNrlPredictionError("Supabase is not configured for NRL predictions.");
        return;
      }

      try {
        setIsLoadingNrlPredictions(true);
        setNrlPredictionError(null);
        const nextPredictions = await fetchCurrentNrlSinglePredictions(nrlSinglePredictionModelKey);

        if (isActive) {
          setNrlPredictions(nextPredictions);
        }
      } catch (error) {
        if (isActive) {
          setNrlPredictions(null);
          setNrlPredictionError(error instanceof Error ? error.message : "NRL predictions failed to load.");
        }
      } finally {
        if (isActive) {
          setIsLoadingNrlPredictions(false);
        }
      }
    }

    loadNrlPredictions();

    return () => {
      isActive = false;
    };
  }, [nrlSinglePredictionModelKey, predictionSport]);

  useEffect(() => {
    let isActive = true;

    async function loadNpcPredictions() {
      if (predictionSport !== "npc") {
        return;
      }

      if (!hasSupabaseNpcPredictionsConfig) {
        setNpcPredictions(null);
        setNpcPredictionError("Supabase is not configured for NPC predictions.");
        return;
      }

      try {
        setIsLoadingNpcPredictions(true);
        setNpcPredictionError(null);
        const nextPredictions = await fetchCurrentNpcSinglePredictions(npcSinglePredictionModelKey);

        if (isActive) {
          setNpcPredictions(nextPredictions);
        }
      } catch (error) {
        if (isActive) {
          setNpcPredictions(null);
          setNpcPredictionError(error instanceof Error ? error.message : "NPC predictions failed to load.");
        }
      } finally {
        if (isActive) {
          setIsLoadingNpcPredictions(false);
        }
      }
    }

    loadNpcPredictions();

    return () => {
      isActive = false;
    };
  }, [npcSinglePredictionModelKey, predictionSport]);

  useEffect(() => {
    let isActive = true;

    async function loadCandidates() {
      if (!hasSupabasePredictionCacheConfig) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("unconfigured");
        setLoadError("Supabase is not configured for bet candidates.");
        return;
      }

      setStatus("loading");
      setLoadError(null);

      try {
        let latestSnapshot = await fetchLatestPredictionSnapshot<RecommendationPayload>();
        let refreshError: Error | null = null;

        if (!isActive) {
          return;
        }

        if (latestSnapshot?.sourceTable === "current_promotion_snapshots") {
          setRefreshMessage("Prediction cache table is not deployed yet. Showing latest promotion snapshot temporarily.");
        }

        if (!latestSnapshot && hasPredictionRefreshEndpoint) {
          setIsRequestingRefresh(true);
          setRefreshMessage("Requesting today's pre-finalisation bet candidates.");
          let refreshedPayload: RecommendationPayload | null = null;

          try {
            refreshedPayload = await requestPredictionRefresh<RecommendationPayload>();
          } catch (error) {
            refreshError = error instanceof Error ? error : new Error("Prediction refresh failed.");
          }

          latestSnapshot = refreshedPayload
            ? createSnapshotFromPayload(refreshedPayload)
            : await fetchLatestPredictionSnapshot<RecommendationPayload>();
        }

        if (
          latestSnapshot?.sourceTable !== "current_promotion_snapshots"
          && latestSnapshot
          && isSnapshotStale(latestSnapshot.generatedAt)
          && !isPredictionWindowClosedNow(latestSnapshot.payload.predictionWindow)
          && hasPredictionRefreshEndpoint
        ) {
          setIsRequestingRefresh(true);
          setRefreshMessage("Refreshing stale bet candidates.");

          try {
            const refreshedPayload = await requestPredictionRefresh<RecommendationPayload>();
            latestSnapshot = refreshedPayload
              ? createSnapshotFromPayload(refreshedPayload)
              : await fetchLatestPredictionSnapshot<RecommendationPayload>();
          } catch (error) {
            refreshError = error instanceof Error ? error : new Error("Prediction refresh failed.");
          }
        }

        if (!isActive) {
          return;
        }

        if (!latestSnapshot) {
          setPayload(null);
          setSnapshotGeneratedAt(null);
          setStatus(refreshError ? "error" : "empty");
          setLoadError(refreshError?.message ?? null);
          return;
        }

        setPayload(latestSnapshot.payload);
        setSnapshotGeneratedAt(latestSnapshot.generatedAt);
        setStatus("supabase");
        setRefreshMessage(refreshError
          ? `Prediction refresh failed, but cached candidates loaded: ${refreshError.message}`
          : null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPayload(null);
        setStatus("error");
        setLoadError(error instanceof Error ? error.message : "Bet candidates failed to load.");
      } finally {
        if (isActive) {
          setIsRequestingRefresh(false);
        }
      }
    }

    loadCandidates();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadTrackedBets() {
      if (!user) {
        setTrackedBets([]);
        return;
      }

      try {
        const nextTrackedBets = await fetchUserRaceBets();

        if (isActive) {
          setTrackedBets(nextTrackedBets);
        }
      } catch (error) {
        if (isActive) {
          setTrackedBetError(error instanceof Error ? error.message : "Tracked bets failed to load.");
        }
      }
    }

    loadTrackedBets();

    return () => {
      isActive = false;
    };
  }, [user]);

  useEffect(() => {
    let isActive = true;

    async function loadLockedWinPercentageMulti() {
      if (!user || !sourceDate || predictionSport !== "racing") {
        setLockedWinPercentageMulti(null);
        return;
      }

      try {
        const locked = await fetchLockedWinPercentageMulti(sourceDate, winPercentageMultiModelKey);

        if (isActive) {
          setLockedWinPercentageMulti(locked);
        }
      } catch (error) {
        if (isActive) {
          setLockedMultiError(error instanceof Error ? error.message : "Locked percentage multi failed to load.");
        }
      }
    }

    loadLockedWinPercentageMulti();

    return () => {
      isActive = false;
    };
  }, [predictionSport, sourceDate, user, winPercentageMultiModelKey]);

  useEffect(() => {
    let isActive = true;

    async function loadLockedUfcMultis() {
      if (!user || !sourceDate || !isUfcWinPercentageMulti || !activeUfcModelRun?.recommendations.length) {
        setLockedUfcMultis({});
        return;
      }

      try {
        const locks = await Promise.all(activeUfcModelRun.recommendations.map((recommendation) =>
          fetchLockedUfcMulti(sourceDate, recommendation.sourceCardId, winPercentageMultiModelKey)));

        if (!isActive) {
          return;
        }

        setLockedUfcMultis(Object.fromEntries(locks
          .filter((lock): lock is LockedUfcMultiRecommendation => Boolean(lock))
          .map((lock) => [lock.sourceCardId, lock])));
      } catch (error) {
        if (isActive) {
          setLockedMultiError(error instanceof Error ? error.message : "Locked UFC multis failed to load.");
        }
      }
    }

    loadLockedUfcMultis();

    return () => {
      isActive = false;
    };
  }, [activeUfcModelRun, isUfcWinPercentageMulti, sourceDate, user, winPercentageMultiModelKey]);

  useEffect(() => {
    let isActive = true;

    async function loadLockedCurrentPrediction() {
      if (!user || !currentPredictionSourceDate) {
        setLockedCurrentPrediction(null);
        return;
      }

      try {
        const locked = await fetchLockedCurrentPrediction({
          predictionFormat,
          predictionModel: currentPredictionModel,
          predictionSport,
          predictionType,
          sourceDate: currentPredictionSourceDate,
        });

        if (isActive) {
          setLockedCurrentPrediction(locked);
        }
      } catch (error) {
        if (isActive) {
          setLockedCurrentPredictionError(error instanceof Error ? error.message : "Locked current prediction failed to load.");
        }
      }
    }

    loadLockedCurrentPrediction();

    return () => {
      isActive = false;
    };
  }, [
    currentPredictionModel,
    currentPredictionSourceDate,
    predictionFormat,
    predictionSport,
    predictionType,
    user,
  ]);

  async function refreshCandidates() {
    if (!hasSupabasePredictionCacheConfig) {
      setRefreshMessage("Supabase is not configured for bet candidates.");
      return;
    }

    try {
      setIsRequestingRefresh(true);
      setRefreshMessage(predictionSport === "ufc"
        ? "Requesting fresh UFC multis."
        : predictionSport === "pfl"
          ? "Requesting fresh PFL predictions."
          : "Requesting fresh bet candidates.");
      setLoadError(null);
      let refreshError: Error | null = null;
      let refreshedPayload: RecommendationPayload | null = null;

      if (hasPredictionRefreshEndpoint) {
        try {
          refreshedPayload = await requestPredictionRefresh<RecommendationPayload>({
            sport: predictionSport === "nrl" || predictionSport === "npc" ? "racing" : predictionSport,
          });
        } catch (error) {
          refreshError = error instanceof Error ? error : new Error("Prediction refresh failed.");
        }
      }

      if (refreshError && isPredictionWindowClosedError(refreshError)) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("empty");
        setRefreshMessage(refreshError.message);
        return;
      }

      const latestSnapshot = refreshedPayload
        ? createSnapshotFromPayload(refreshedPayload)
        : await fetchLatestPredictionSnapshot<RecommendationPayload>();

      if (!latestSnapshot) {
        setPayload(null);
        setSnapshotGeneratedAt(null);
        setStatus("empty");
        setRefreshMessage("No Supabase candidate snapshot is available yet.");
        return;
      }

      setPayload(latestSnapshot.payload);
      setSnapshotGeneratedAt(latestSnapshot.generatedAt);
      setStatus("supabase");
      setRefreshMessage(latestSnapshot.sourceTable === "current_promotion_snapshots"
        ? "Prediction cache table is not deployed yet. Showing latest promotion snapshot temporarily."
          : refreshError
            ? `Prediction refresh failed, but cached candidates loaded: ${refreshError.message}`
            : hasPredictionRefreshEndpoint
            ? predictionSport === "ufc"
              ? "Fresh UFC multis loaded."
              : predictionSport === "pfl"
                ? "Fresh PFL predictions loaded."
                : "Fresh bet candidates loaded."
            : "Supabase cache rechecked. Configure EXPO_PUBLIC_PREDICTION_REFRESH_URL to generate new candidates from the app.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not refresh bet candidates.");
      setStatus("error");
    } finally {
      setIsRequestingRefresh(false);
    }
  }

  async function lockCurrentPredictionView() {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    if (lockedCurrentPrediction) {
      setLockedCurrentPredictionMessage(`Current view locked from ${formatDateTime(lockedCurrentPrediction.lockedAt)}.`);
      return;
    }

    const payloadToLock = predictionSport === "nrl"
      ? nrlPredictions
      : predictionSport === "npc"
        ? npcPredictions
        : payload;

    if (!payloadToLock) {
      setLockedCurrentPredictionError("No current prediction view is available to lock.");
      return;
    }

    if (!isBeforeLockCutoff(finalisationStatus.finalisesAt)) {
      setLockedCurrentPredictionError("Prediction locking has closed for this sport.");
      return;
    }

    try {
      setIsLockingCurrentPrediction(true);
      setLockedCurrentPredictionError(null);
      setLockedCurrentPredictionMessage(null);
      const locked = await saveLockedCurrentPrediction({
        generatedAt: currentPredictionGeneratedAt,
        generatedAtNz: currentPredictionGeneratedAtNz,
        lockCutoffAt: finalisationStatus.finalisesAt,
        payload: payloadToLock,
        predictionFormat,
        predictionModel: currentPredictionModel,
        predictionSport,
        predictionType,
        sourceDate: currentPredictionSourceDate,
        sourceTimeZone: payload?.sourceTimeZone ?? SOURCE_TIME_ZONE,
      });

      setLockedCurrentPrediction(locked);
      setLockedCurrentPredictionMessage(`Locked current view from ${formatDateTime(locked.lockedAt)}.`);
    } catch (error) {
      setLockedCurrentPredictionError(error instanceof Error ? error.message : "Could not lock current prediction view.");
    } finally {
      setIsLockingCurrentPrediction(false);
    }
  }

  async function trackCandidateBet(input: UserRaceBetInput) {
    try {
      setTrackedBetError(null);
      setTrackedBetMessage(null);
      await saveUserRaceBet(input);
      setTrackedBets(await fetchUserRaceBets());
      setTrackedBetMessage(`${formatBookmaker(input.bookmaker)} bet tracked for ${input.courseName} R${input.raceNumber}.`);
    } catch (error) {
      setTrackedBetError(error instanceof Error ? error.message : "Could not track bet candidate.");
    }
  }

  async function lockWinPercentageMulti() {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    if (!payload || !winPercentageMultiRecommendation) {
      setLockedMultiError("No percentage multi is available to lock.");
      return;
    }

    if (lockedWinPercentageMulti) {
      setLockedMultiMessage(`Locked percentage multi from ${formatDateTime(lockedWinPercentageMulti.lockedAt)} is already active.`);
      return;
    }

    if (!isBeforeLockCutoff(racingLockCutoffAt)) {
      setLockedMultiError("Percentage multi locking closes when predictions finalise.");
      return;
    }

    try {
      setIsLockingWinPercentageMulti(true);
      setLockedMultiError(null);
      setLockedMultiMessage(null);
      const locked = await saveLockedWinPercentageMulti(
        createLockedWinPercentageMultiInput(payload, winPercentageMultiRecommendation, winPercentageMultiModelKey),
        winPercentageMultiModelKey,
      );
      setLockedWinPercentageMulti(locked);
      setLockedMultiMessage(`Locked percentage multi from ${formatDateTime(locked.lockedAt)}.`);
    } catch (error) {
      setLockedMultiError(error instanceof Error ? error.message : "Could not lock percentage multi.");
    } finally {
      setIsLockingWinPercentageMulti(false);
    }
  }

  async function lockUfcPercentageMulti(recommendation: UfcMultiRecommendation) {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    if (!payload) {
      setLockedMultiError("No UFC percentage multi is available to lock.");
      return;
    }

    if (lockedUfcMultis[recommendation.sourceCardId]) {
      setLockedMultiMessage(`Locked UFC multi from ${formatDateTime(lockedUfcMultis[recommendation.sourceCardId].lockedAt)} is already active.`);
      return;
    }

    if (!isBeforeLockCutoff(recommendation.lockCutoffAt)) {
      setLockedMultiError("UFC multi locking has closed for this fight card.");
      return;
    }

    try {
      setLockingUfcCardId(recommendation.sourceCardId);
      setLockedMultiError(null);
      setLockedMultiMessage(null);
      const locked = await saveLockedUfcMulti(
        createLockedUfcMultiInput(
          payload,
          payload.ufcWinPercentageMultis?.source ?? "betcha",
          recommendation,
        ),
        winPercentageMultiModelKey,
      );
      setLockedUfcMultis((current) => ({
        ...current,
        [locked.sourceCardId]: locked,
      }));
      setLockedMultiMessage(`Locked UFC multi from ${formatDateTime(locked.lockedAt)}.`);
    } catch (error) {
      setLockedMultiError(error instanceof Error ? error.message : "Could not lock UFC multi.");
    } finally {
      setLockingUfcCardId(null);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.subheading}>{sectionTitle}</Text>
          {predictionSport === "nrl" ? (
            <Text style={styles.sectionNote}>
              {nrlPredictions?.totalCount ?? 0} stored NRL predictions · source date{" "}
              {nrlPredictions?.sourceDate ?? "not generated"}
            </Text>
          ) : predictionSport === "npc" ? (
            <Text style={styles.sectionNote}>
              {npcPredictions?.totalCount ?? 0} stored NPC predictions · source date{" "}
              {npcPredictions?.sourceDate ?? "not generated"}
            </Text>
          ) : predictionSport === "ufc" ? (
            <Text style={styles.sectionNote}>
              {payload?.ufcWinPercentageMultis?.scannedUfcCardCount ?? 0} UFC cards scanned ·{" "}
              {payload?.ufcWinPercentageMultis?.models.reduce((total, model) =>
                total + model.recommendations.length, 0) ?? 0} card recommendations
            </Text>
          ) : predictionSport === "pfl" ? (
            <Text style={styles.sectionNote}>
              {payload?.pflWinPercentageMultis?.scannedPflCardCount ?? 0} reviewed PFL cards matched ·{" "}
              {payload?.pflWinPercentageMultis?.matchedPflFightCount ?? 0} priced fights
            </Text>
          ) : (
            <Text style={styles.sectionNote}>
              {betCandidateScan?.scannedRaceCount ?? 0} current races scanned ·{" "}
              {betCandidateScan?.eligibleRaceCount ?? 0} priced candidates ·{" "}
              {betCandidateScan?.scannedMeetings ?? 0} meetings
            </Text>
          )}
          {predictionSport === "racing" && predictionType === "cash" ? (
            <Text style={styles.sectionNote}>
              Current model {selectedModelRun?.label ?? "Global bucket blend"}
            </Text>
          ) : null}
          {predictionSport === "nrl" ? (
            <Text style={styles.sectionNote}>
              {isLoadingNrlPredictions ? "Loading NRL predictions" : "Loaded from NRL single prediction rows"}
            </Text>
          ) : predictionSport === "npc" ? (
            <Text style={styles.sectionNote}>
              {isLoadingNpcPredictions ? "Loading NPC predictions" : "Loaded from NPC single prediction rows"}
            </Text>
          ) : predictionSport === "pfl" ? (
            <Text style={styles.sectionNote}>
              {payload?.pflWinPercentageMultis
                ? "Loaded from reviewed PFL current odds"
                : "PFL current odds are not in this snapshot yet"}
            </Text>
          ) : (
            <>
              <Text style={styles.sectionNote}>{statusLabel}</Text>
              <Text style={styles.sectionNote}>
                Snapshot age {formatCacheAge(cacheAgeMs)}
                {predictionWindowClosedNow ? " · prediction finalised" : " · refresh before finalisation"}
              </Text>
            </>
          )}
          <PredictionFinalisationNotice status={finalisationStatus} />
          <CurrentPredictionLockControl
            disabledReason={currentPredictionLockDisabledReason}
            isLocked={Boolean(lockedCurrentPrediction)}
            isLocking={isLockingCurrentPrediction}
            lockedAt={lockedCurrentPrediction?.lockedAt ?? null}
            onLock={lockCurrentPredictionView}
          />
          <PredictionNotificationControl
            enabled={currentPredictionNotificationEnabled}
            isSaving={isSavingPredictionNotification || isSigningIn}
            onToggle={toggleCurrentPredictionNotification}
            userIsSignedIn={Boolean(user)}
          />
        </View>
        {predictionSport === "nrl" || predictionSport === "npc" ? null : (
          <Pressable
            disabled={isRequestingRefresh}
            onPress={refreshCandidates}
            style={[
              styles.refreshButton,
              isRequestingRefresh ? styles.refreshButtonDisabled : null,
            ]}
          >
            <Text style={styles.refreshButtonText}>
              {isRequestingRefresh ? "Refreshing" : "Refresh"}
            </Text>
          </Pressable>
        )}
      </View>

      {predictionSport !== "nrl" && predictionSport !== "npc" && predictionSport !== "pfl" && candidatesAreStale ? (
        <View style={styles.staleState}>
          <Text style={styles.staleStateText}>
            Bet candidates were captured before finalisation, but prices may still change while the window is open. Refresh before predictions finalise.
          </Text>
          {!hasPredictionRefreshEndpoint ? (
            <Text style={styles.staleStateText}>
              No app refresh endpoint is configured. Run the current-predictions worker or add
              EXPO_PUBLIC_PREDICTION_REFRESH_URL.
            </Text>
          ) : null}
        </View>
      ) : null}

      {predictionSport !== "nrl" && predictionSport !== "npc" && predictionSport !== "pfl" && predictionWindowClosedNow ? (
        <View style={styles.staleState}>
          <Text style={styles.staleStateText}>
            Prediction window is closed for today. Showing the stored snapshot captured before {payload?.predictionWindow?.finalisesAtNz ?? payload?.predictionWindow?.finalisesAt ?? "finalisation"}.
          </Text>
        </View>
      ) : null}

      {predictionSport !== "nrl" && predictionSport !== "npc" && loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      {predictionSport !== "nrl" && predictionSport !== "npc" && refreshMessage ? <Text style={styles.contextText}>{refreshMessage}</Text> : null}
      {trackedBetError ? (
        <Text style={styles.errorText}>{trackedBetError}</Text>
      ) : trackedBetMessage ? (
        <Text style={styles.contextText}>{trackedBetMessage}</Text>
      ) : null}
      {lockedMultiError ? (
        <Text style={styles.errorText}>{lockedMultiError}</Text>
      ) : lockedMultiMessage ? (
        <Text style={styles.contextText}>{lockedMultiMessage}</Text>
      ) : null}
      {lockedCurrentPredictionError ? (
        <Text style={styles.errorText}>{lockedCurrentPredictionError}</Text>
      ) : lockedCurrentPredictionMessage ? (
        <Text style={styles.contextText}>{lockedCurrentPredictionMessage}</Text>
      ) : null}
      {predictionNotificationError ? (
        <Text style={styles.errorText}>{predictionNotificationError}</Text>
      ) : predictionNotificationMessage ? (
        <Text style={styles.contextText}>{predictionNotificationMessage}</Text>
      ) : null}

      {predictionSport === "racing" && predictionType === "cash" ? (
        <SignalGuide modelKey={selectedModelKey} modelLabel={selectedModelRun?.label ?? "Global bucket blend"} />
      ) : null}

      {predictionSport === "pfl" ? (
        predictionType === "win_percentage" ? (
          predictionFormat === "singles" ? (
            <UfcWinPercentageSinglesPanel
              modelKey={winPercentageMultiModelKey}
              modelRun={activePflModelRun}
              sportLabel="PFL"
            />
          ) : (
            <UfcWinPercentageMultiRecommendationsPanel
              isSigningIn={false}
              lockedMultis={{}}
              lockingCardId={null}
              locksEnabled={false}
              modelKey={winPercentageMultiModelKey}
              modelRun={activePflModelRun}
              onLock={() => undefined}
              sportLabel="PFL"
              userIsSignedIn={false}
            />
          )
        ) : (
          <StateMessage text={unsupportedBranchMessage ?? "No PFL models are tracked for this branch yet."} />
        )
      ) : predictionSport === "nrl" ? (
        predictionFormat === "singles" && predictionType === "win_percentage" ? (
          <TeamSportSinglePredictionsPanel
            errorMessage={nrlPredictionError}
            isLoading={isLoadingNrlPredictions}
            result={nrlPredictions}
            sportLabel="NRL"
          />
        ) : (
          <StateMessage text={unsupportedBranchMessage ?? "No NRL models are tracked for this branch yet."} />
        )
      ) : predictionSport === "npc" ? (
        predictionFormat === "singles" && predictionType === "win_percentage" ? (
          <TeamSportSinglePredictionsPanel
            errorMessage={npcPredictionError}
            isLoading={isLoadingNpcPredictions}
            result={npcPredictions}
            sportLabel="NPC"
          />
        ) : (
          <StateMessage text={unsupportedBranchMessage ?? "No NPC models are tracked for this branch yet."} />
        )
      ) : !payload ? (
        <StateMessage text={getUnavailableMessage(status)} />
      ) : unsupportedBranchMessage ? (
        <StateMessage text={unsupportedBranchMessage} />
      ) : predictionType === "win_percentage" ? (
        predictionSport === "ufc" && predictionFormat === "singles" ? (
          <UfcWinPercentageSinglesPanel
            modelKey={winPercentageMultiModelKey}
            modelRun={activeUfcModelRun}
            sportLabel="UFC"
          />
        ) : predictionFormat === "singles" ? (
          <WinPercentageSinglesPanel
            candidates={winPercentageSingleCandidates}
            modelKey={predictionModelKey}
          />
        ) : isUfcWinPercentageMulti ? (
          <UfcWinPercentageMultiRecommendationsPanel
            isSigningIn={isSigningIn}
            lockedMultis={lockedUfcMultis}
            lockingCardId={lockingUfcCardId}
            modelKey={winPercentageMultiModelKey}
            modelRun={activeUfcModelRun}
            onLock={lockUfcPercentageMulti}
            sportLabel="UFC"
            userIsSignedIn={Boolean(user)}
          />
        ) : (
          <WinPercentageMultiRecommendationPanel
            disabledReason={getWinPercentageLockDisabledReason({
              isLocked: Boolean(lockedWinPercentageMulti),
              isSignedIn: Boolean(user),
              lockCutoffAt: racingLockCutoffAt,
              recommendation: winPercentageMultiRecommendation,
            })}
            isLocked={Boolean(lockedWinPercentageMulti)}
            isLocking={isLockingWinPercentageMulti || isSigningIn}
            lockCutoffAt={racingLockCutoffAt}
            lockedAt={lockedWinPercentageMulti?.lockedAt ?? null}
            modelKey={winPercentageMultiModelKey}
            onLock={lockWinPercentageMulti}
            recommendation={displayedWinPercentageMultiRecommendation}
          />
        )
      ) : predictionType === "placing" ? (
        predictionFormat === "multis" ? (
          <WinPercentageMultiRecommendationPanel
            disabledReason={getWinPercentageLockDisabledReason({
              isLocked: Boolean(lockedWinPercentageMulti),
              isSignedIn: Boolean(user),
              lockCutoffAt: racingLockCutoffAt,
              recommendation: winPercentageMultiRecommendation,
            })}
            isLocked={Boolean(lockedWinPercentageMulti)}
            isLocking={isLockingWinPercentageMulti || isSigningIn}
            lockCutoffAt={racingLockCutoffAt}
            lockedAt={lockedWinPercentageMulti?.lockedAt ?? null}
            modelKey={winPercentageMultiModelKey}
            onLock={lockWinPercentageMulti}
            recommendation={displayedWinPercentageMultiRecommendation}
          />
        ) : (
          <PlacingRecommendationsPanel recommendations={placingRecommendations} />
        )
      ) : predictionFormat === "multis" ? (
        <MultiBetRecommendationPanel
          modelKey={selectedModelKey}
          recommendation={multiBetRecommendation}
        />
      ) : betCandidates.length ? (
        <>
          <View style={styles.disciplineTabs}>
            {candidateGroups.map((group) => {
              const isActive = group.code === activeCandidateGroup?.code;

              return (
                <Pressable
                  key={group.code}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setSelectedDisciplineCode(group.code)}
                  style={[
                    styles.disciplineTab,
                    isActive ? styles.disciplineTabActive : null,
                  ]}
                >
                  <Text style={[
                    styles.disciplineTabText,
                    isActive ? styles.disciplineTabTextActive : null,
                  ]}
                  >
                    {group.label} {group.candidates.length}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeCandidateGroup ? (
            <View key={activeCandidateGroup.code} style={styles.candidateGroup}>
              <Text style={styles.candidateGroupHeading}>{activeCandidateGroup.label}</Text>
              {activeCandidateGroup.candidates.map((race) => (
                <View key={race.raceCardId} style={styles.candidateCard}>
                  <View style={styles.candidateHeader}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{race.rank}</Text>
                    </View>
                    <View style={styles.candidateTitleBlock}>
                      <View style={styles.raceTitleRow}>
                        <RaceDisciplineIcon code={race.code} />
                        <Text style={styles.raceTitle}>
                          R{race.raceNumber} {race.sourceTrack}
                        </Text>
                      </View>
                      <Text style={styles.raceMeta}>
                        {formatDateTime(race.advertisedStart)} · {race.starters} starters ·{" "}
                        {race.country ?? "Unknown"} · {race.code}
                      </Text>
                    </View>
                    <View style={[styles.signalBadge, styles[`signal_${race.candidate.tone}`]]}>
                      <Text style={styles.signalText}>
                        {formatCandidatePillLabel(race.candidate.label, selectedModelKey)}
                      </Text>
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
                      label={modelScoreLabel}
                      value={formatCurrency(getCandidateCashAverage(race, selectedModelKey))}
                      detail={`${race.candidate.sampleSize} bucket selections`}
                    />
                    <Metric
                      label="Cash+bonus avg"
                      value={formatCurrency(race.candidate.blendedCashPlusBonusAverage)}
                      detail="Supporting context"
                    />
                    <Metric
                      label="Other avg fixed win"
                      value={formatCurrency(race.fieldPriceShape?.otherStartersAverageFixedWinPrice ?? null)}
                      detail={formatOtherStartersPriceShape(race)}
                    />
                  </View>

                  <View style={styles.metricGrid}>
                    <Metric
                      label="Price bucket"
                      value={race.historical.priceBucket
                        ? race.historical.priceBucket.label
                        : "-"}
                      detail={race.historical.priceBucket
                        ? `${formatCurrency(race.historical.priceBucket.averageReturnPerDollar)} cash avg · ${formatCurrency(race.historical.priceBucket.averageValuePerDollarWithBonusCredit)} cash+bonus · ${formatPercentage(race.historical.priceBucket.bonusBetCreditPercentage)} bonus hit`
                        : undefined}
                    />
                    <Metric
                      label="Starter bucket"
                      value={race.historical.starterBucket
                        ? `${race.historical.starterBucket.label} starters`
                        : "-"}
                      detail={race.historical.starterBucket
                        ? `${formatCurrency(race.historical.starterBucket.averageReturnPerDollar)} cash avg · ${formatCurrency(race.historical.starterBucket.averageValuePerDollarWithBonusCredit)} cash+bonus`
                        : undefined}
                    />
                    <Metric
                      label="MarketMover"
                      value={race.marketMover
                        ? `#${race.marketMover.number} ${race.marketMover.name}`
                        : "-"}
                    />
                  </View>

                  <Text style={styles.contextText}>{race.candidate.detail}</Text>
                  <TrackBetButton
                    disabledReason={getTrackBetDisabledReason(Boolean(user), race)}
                    isLogged={isUserRaceBetLogged(trackedBets, race.raceCardId, "betcha")}
                    onPress={() => trackCandidateBet(createCandidateBetInput({
                      payload,
                      race,
                    }))}
                  />
                </View>
              ))}
              </View>
          ) : null}
        </>
      ) : (
        <StateMessage text="No priced bet candidates are available in the Supabase prediction snapshot." />
      )}
    </View>
  );
}

/**
 * Names the active current prediction family in the snapshot status panel.
 */
function getPredictionTypeHeading(predictionType: CurrentPredictionType, predictionFormat: PredictionFormat) {
  const formatLabel = predictionFormat === "multis" ? "Multi" : "Single";

  if (predictionType === "win_percentage") {
    return `${formatLabel} win percentage predictions`;
  }

  if (predictionType === "placing") {
    return `${formatLabel} placing predictions`;
  }

  return `${formatLabel} cash model predictions`;
}

/**
 * Explains branches that exist in the shared structure before matching models have been implemented.
 */
function getUnsupportedPredictionBranchMessage({
  predictionFormat,
  predictionSport,
  predictionType,
}: {
  predictionFormat: PredictionFormat;
  predictionSport: PredictionSport;
  predictionType: CurrentPredictionType;
}) {
  if (predictionSport === "ufc" && predictionType !== "win_percentage") {
    return `No UFC ${predictionFormat === "singles" ? "single" : "multi"} ${predictionType} models are tracked yet.`;
  }

  if (predictionSport === "pfl" && predictionType !== "win_percentage") {
    return `No PFL ${predictionFormat === "singles" ? "single" : "multi"} ${predictionType} models are tracked yet.`;
  }

  if (predictionSport === "nrl" && (predictionFormat !== "singles" || predictionType !== "win_percentage")) {
    return `No NRL ${predictionFormat === "singles" ? "single" : "multi"} ${predictionType} models are tracked yet.`;
  }

  if (predictionSport === "npc" && (predictionFormat !== "singles" || predictionType !== "win_percentage")) {
    return `No NPC ${predictionFormat === "singles" ? "single" : "multi"} ${predictionType} models are tracked yet.`;
  }

  return null;
}

type MultiBetRecommendationPanelProps = {
  modelKey: string;
  recommendation: MultiBetRecommendation | null;
};

type TeamSportSinglePredictionItem = NrlSinglePredictionItem | NpcSinglePredictionItem;
type TeamSportSinglePredictionsResult = NrlSinglePredictionsResult | NpcSinglePredictionsResult;

type TeamSportSinglePredictionsPanelProps = {
  errorMessage: string | null;
  isLoading: boolean;
  result: TeamSportSinglePredictionsResult | null;
  sportLabel: string;
};

/**
 * Shows current persisted team-sport single prediction rows for the selected percentage model.
 */
function TeamSportSinglePredictionsPanel({
  errorMessage,
  isLoading,
  sportLabel,
  result,
}: TeamSportSinglePredictionsPanelProps) {
  if (isLoading) {
    return <StateMessage text={`Loading stored ${sportLabel} single predictions.`} />;
  }

  if (errorMessage) {
    return <StateMessage text={errorMessage} />;
  }

  if (!result || !result.predictions.length) {
    return <StateMessage text={`No ${sportLabel} single predictions have been generated yet.`} />;
  }

  return (
    <View style={styles.candidateGroup}>
      {result.predictions.map((prediction) => (
        <TeamSportSinglePredictionCard key={prediction.id} prediction={prediction} />
      ))}
    </View>
  );
}

type TeamSportSinglePredictionCardProps = {
  prediction: TeamSportSinglePredictionItem;
};

/**
 * Renders one stored team-sport single prediction row.
 */
function TeamSportSinglePredictionCard({ prediction }: TeamSportSinglePredictionCardProps) {
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{prediction.rank}</Text>
        </View>
        <View style={styles.candidateTitleBlock}>
          <Text style={styles.raceTitle}>{prediction.teamLabel}</Text>
          <Text style={styles.raceMeta}>
            {prediction.matchLabel} · {prediction.startLabel}
          </Text>
        </View>
        <View style={[styles.signalBadge, styles[`signal_${prediction.signalTone}`]]}>
          <Text style={styles.signalText}>{prediction.signal}</Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{prediction.score}</Text>
          <Text style={styles.metricLabel}>Model score</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{prediction.price}</Text>
          <Text style={styles.metricLabel}>Fixed win</Text>
        </View>
      </View>

      <Text style={styles.raceName}>{prediction.detail}</Text>
      <Text style={styles.contextText}>{prediction.meta}</Text>
    </View>
  );
}

type PlacingRecommendationsPanelProps = {
  recommendations: BetCandidate[];
};

type WinPercentageSinglesPanelProps = {
  candidates: BetCandidate[];
  modelKey: PredictionModelKey;
};

type WinPercentageMultiRecommendationPanelProps = {
  disabledReason: string | null;
  isLocked: boolean;
  isLocking: boolean;
  lockCutoffAt: string | null;
  lockedAt: string | null;
  modelKey: WinPercentageMultiModelKey;
  onLock: () => void;
  recommendation: MultiBetRecommendation | null;
};

type UfcWinPercentageMultiRecommendationsPanelProps = {
  isSigningIn: boolean;
  lockedMultis: Record<string, LockedUfcMultiRecommendation>;
  locksEnabled?: boolean;
  lockingCardId: string | null;
  modelKey: WinPercentageMultiModelKey;
  modelRun: UfcWinPercentageMultiModelRun | null;
  onLock: (recommendation: UfcMultiRecommendation) => void;
  sportLabel?: "PFL" | "UFC";
  userIsSignedIn: boolean;
};

type UfcWinPercentageSinglesPanelProps = {
  modelKey: WinPercentageMultiModelKey;
  modelRun: UfcWinPercentageMultiModelRun | null;
  sportLabel?: "PFL" | "UFC";
};

/**
 * Shows the strongest current favourite place signals as a separate prediction family.
 */
function PlacingRecommendationsPanel({ recommendations }: PlacingRecommendationsPanelProps) {
  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>Placing recommendations</Text>
          <Text style={styles.multiContext}>
            Place means paid placings only: top 2 in smaller place fields, top 3 in larger fields.
          </Text>
        </View>
      </View>

      {recommendations.length ? (
        <View style={styles.multiLegList}>
          {recommendations.map((race, index) => {
            const placing = race.placingCandidate;

            return (
              <View key={`place-${race.raceCardId}`} style={styles.multiLeg}>
                <View style={styles.multiLegIndex}>
                  <Text style={styles.multiLegIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.multiLegTextBlock}>
                  <View style={styles.multiLegTitleRow}>
                    <RaceDisciplineIcon code={race.code} size={16} />
                    <Text style={styles.multiLegTitle}>
                      R{race.raceNumber} {race.sourceTrack} · {formatMultiLegRunner(race)}
                    </Text>
                  </View>
                  <Text style={styles.multiLegMeta}>
                    {formatDateTime(race.advertisedStart)} · {race.country ?? "Unknown"} ·{" "}
                    {race.starters} starters · pays top {placing?.placePayoutDepth ?? race.placePayoutDepth ?? "-"}
                  </Text>
                  <Text style={styles.multiLegMeta}>
                    {formatPercentage(placing?.placeScore ?? null)} place score · {placing?.sampleSize ?? 0} place-eligible samples
                  </Text>
                  <Text style={styles.multiLegMeta}>
                    {formatCurrency(placing?.cashAverageScore ?? null)} cash avg score · price{" "}
                    {formatBucketWithCashAverage(placing?.priceBucketLabel, placing?.priceBucketCashAverage)} · starter{" "}
                    {formatBucketWithCashAverage(placing?.starterBucketLabel, placing?.starterBucketCashAverage)}
                  </Text>
                </View>
                <View style={[styles.signalBadge, styles[`signal_${placing?.tone ?? "neutral"}`]]}>
                  <Text style={styles.signalText}>{formatPlacingSignalLabel(placing?.tone)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.multiFooter}>
          No positive or neutral place signals are available in the current snapshot yet.
        </Text>
      )}
    </View>
  );
}

/**
 * Shows every current runner that would be tracked by the selected win-rate singles model.
 */
function WinPercentageSinglesPanel({ candidates, modelKey }: WinPercentageSinglesPanelProps) {
  const threshold = getSingleWinPercentageThreshold(modelKey);

  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>{threshold}%+ win singles</Text>
          <Text style={styles.multiContext}>
            Each listed favourite is tracked as a separate $1 single when its blended historical win score is at least {threshold}%.
          </Text>
        </View>
      </View>

      {candidates.length ? (
        <View style={styles.multiLegList}>
          {candidates.map((race, index) => {
            const signal = race.winPercentageMultiCandidate;

            return (
              <View key={`win-single-${race.raceCardId}`} style={styles.multiLeg}>
                <View style={styles.multiLegIndex}>
                  <Text style={styles.multiLegIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.multiLegTextBlock}>
                  <View style={styles.multiLegTitleRow}>
                    <RaceDisciplineIcon code={race.code} size={16} />
                    <Text style={styles.multiLegTitle}>
                      R{race.raceNumber} {race.sourceTrack} · {formatMultiLegRunner(race)}
                    </Text>
                  </View>
                  <Text style={styles.multiLegMeta}>
                    {formatDateTime(race.advertisedStart)} · {race.country ?? "Unknown"} ·{" "}
                    {race.starters} starters · fixed win {formatCurrency(race.favourite?.fixedWinPrice ?? null)}
                  </Text>
                  <Text style={styles.multiLegMeta}>
                    {formatPercentage(signal?.winScore ?? null)} win score · {signal?.sampleSize ?? 0} bucket selections
                  </Text>
                  <Text style={styles.multiLegMeta}>
                    Price {formatBucketWithWinPercentage(signal?.priceBucketLabel, signal?.priceBucketWinPercentage)} · starter{" "}
                    {formatBucketWithWinPercentage(signal?.starterBucketLabel, signal?.starterBucketWinPercentage)}
                  </Text>
                </View>
                <View style={[styles.signalBadge, styles.signal_positive]}>
                  <Text style={styles.signalText}>{threshold}%+ single</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.multiFooter}>
          No current favourites have a {threshold}%+ blended historical win score in this snapshot.
        </Text>
      )}
    </View>
  );
}

/**
 * Shows the dedicated multi-only model that scores legs from historical win percentages.
 */
function WinPercentageMultiRecommendationPanel({
  disabledReason,
  isLocked,
  isLocking,
  lockCutoffAt,
  lockedAt,
  modelKey,
  onLock,
  recommendation,
}: WinPercentageMultiRecommendationPanelProps) {
  const isLockDisabled = isLocked || isLocking || Boolean(disabledReason && disabledReason !== "Sign in to lock");
  const threshold = getWinPercentageMultiThreshold(modelKey);
  const isThresholdModel = threshold !== null;
  const isPlacePercentageModel = isPlacingPercentageMultiModel(modelKey);
  const modelLabel = getPercentageMultiDisplayLabel(modelKey);

  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>
            {isLocked
              ? `Locked ${modelLabel}`
              : isPlacePercentageModel
                ? "Place percentage multi recommendation"
                : isThresholdModel
                ? `${threshold}%+ win percentage multi recommendation`
                : "Original win percentage multi recommendation"}
          </Text>
          <Text style={styles.multiContext}>
            {isLocked && lockedAt
              ? `Locked ${formatDateTime(lockedAt)}. This snapshot will stay active even if the live recommendation changes.`
              : recommendation
                ? isPlacePercentageModel
                  ? `${recommendation.legs.length} place-rate legs from active place markets`
                  : isThresholdModel
                  ? `${recommendation.legs.length} legs with at least ${threshold}% blended historical win score`
                  : `${recommendation.legs.length} ${recommendation.tone} win-rate legs from price and starter buckets`
                : isPlacePercentageModel
                  ? `Needs at least ${MULTI_BET_MIN_LEGS} priced favourites with active place markets`
                  : isThresholdModel
                  ? `Needs at least ${MULTI_BET_MIN_LEGS} priced legs with ${threshold}%+ blended win score`
                  : `Needs at least ${MULTI_BET_MIN_LEGS} neutral-or-better win-rate legs`}
          </Text>
        </View>
        <View style={styles.multiActions}>
          {recommendation ? (
            <View style={[styles.signalBadge, styles[`signal_${recommendation.tone}`]]}>
              <Text style={styles.signalText}>
                {recommendation.tone === "positive" ? "Positive multi" : "Neutral multi"}
              </Text>
            </View>
          ) : null}
          <Pressable
            disabled={isLockDisabled}
            onPress={onLock}
            style={[
              styles.lockButton,
              isLocked ? styles.lockButtonLocked : null,
              isLockDisabled ? styles.lockButtonDisabled : null,
            ]}
          >
            <Text style={[
              styles.lockButtonText,
              isLocked ? styles.lockButtonTextLocked : null,
            ]}
            >
              {isLocked ? "Locked" : isLocking ? "Locking" : disabledReason === "Sign in to lock" ? "Sign in to lock" : "Lock"}
            </Text>
          </Pressable>
          <Text style={styles.lockCutoffText}>{formatLockCutoffLabel(lockCutoffAt)}</Text>
        </View>
      </View>
      {!isLocked && disabledReason && disabledReason !== "Sign in to lock" ? (
        <Text style={styles.multiFooter}>{disabledReason}</Text>
      ) : null}

      {recommendation ? (
        <>
          <View style={styles.multiMetricRow}>
            <Metric
              label={isPlacePercentageModel ? "Max legs" : "Combined fixed win"}
              value={isPlacePercentageModel ? String(PLACING_PERCENTAGE_MAX_LEGS) : formatCombinedFixedWinPrice(recommendation.combinedFixedWinPrice)}
            />
            <Metric
              label={isPlacePercentageModel ? "Avg place score" : "Avg win score"}
              value={formatPercentage(getAveragePercentageMultiScore(recommendation.legs, modelKey))}
            />
          </View>
          <View style={styles.multiLegList}>
            {recommendation.legs.map((race, index) => {
              const winSignal = race.winPercentageMultiCandidate;
              const placeSignal = race.placingCandidate;
              const tone = isPlacePercentageModel ? placeSignal?.tone : winSignal?.tone;

              return (
                <View key={`win-multi-${race.raceCardId}`} style={styles.multiLeg}>
                  <View style={styles.multiLegIndex}>
                    <Text style={styles.multiLegIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.multiLegTextBlock}>
                    <View style={styles.multiLegTitleRow}>
                      <RaceDisciplineIcon code={race.code} size={16} />
                      <Text style={styles.multiLegTitle}>
                        R{race.raceNumber} {race.sourceTrack} · {formatMultiLegRunner(race)}
                      </Text>
                    </View>
                    <Text style={styles.multiLegMeta}>
                      {formatDateTime(race.advertisedStart)} · {race.country ?? "Unknown"} ·{" "}
                      {formatCurrency(race.favourite?.fixedWinPrice ?? null)} ·{" "}
                      {isPlacePercentageModel
                        ? `${formatPercentage(placeSignal?.placeScore ?? null)} place score · pays top ${placeSignal?.placePayoutDepth ?? "-"}`
                        : `${formatPercentage(winSignal?.winScore ?? null)} win score`}
                    </Text>
                    <Text style={styles.multiLegMeta}>
                      {isPlacePercentageModel
                        ? `Price ${formatBucketWithCashAverage(placeSignal?.priceBucketLabel, placeSignal?.priceBucketCashAverage)} · starter ${formatBucketWithCashAverage(placeSignal?.starterBucketLabel, placeSignal?.starterBucketCashAverage)}`
                        : `Price ${formatBucketWithWinPercentage(winSignal?.priceBucketLabel, winSignal?.priceBucketWinPercentage)} · starter ${formatBucketWithWinPercentage(winSignal?.starterBucketLabel, winSignal?.starterBucketWinPercentage)}`}
                    </Text>
                  </View>
                  <Text style={[styles.multiLegSignal, styles[`signalText_${tone ?? "neutral"}`]]}>
                    {isPlacePercentageModel
                      ? formatPlacingSignalLabel(tone as NonNullable<BetCandidate["placingCandidate"]>["tone"] | undefined)
                      : formatWinPercentageSignalLabel(tone as NonNullable<BetCandidate["winPercentageMultiCandidate"]>["tone"] | undefined)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.multiFooter}>
            {isPlacePercentageModel
              ? "This model ranks favourites by historical place percentages for active place markets and can list up to 8 legs. No place odds, stake size, or automated wagering action is provided."
              : isThresholdModel
              ? `This model only includes favourites with a ${threshold}%+ blended historical win score and can list up to 10 legs. No stake size or automated wagering action is provided.`
              : "This multi-only model uses historical win percentages, not cash-return averages. No stake size or automated wagering action is provided."}
          </Text>
        </>
      ) : (
        <Text style={styles.multiFooter}>
          {isThresholdModel
            ? `${threshold}%+ win-rate legs will appear here once the current snapshot has enough eligible priced favourites.`
            : isPlacePercentageModel
              ? "Place-rate legs will appear here once the current snapshot has enough eligible priced favourites with active place markets."
            : "Positive and neutral win-rate signals will appear here once the current snapshot has enough eligible priced legs."}
        </Text>
      )}
    </View>
  );
}

/**
 * Shows UFC same-card percentage multi recommendations from Betcha fight-card markets.
 */
function UfcWinPercentageMultiRecommendationsPanel({
  isSigningIn,
  lockedMultis,
  locksEnabled = true,
  lockingCardId,
  modelKey,
  modelRun,
  onLock,
  sportLabel = "UFC",
  userIsSignedIn,
}: UfcWinPercentageMultiRecommendationsPanelProps) {
  const recommendations = modelRun?.recommendations ?? [];

  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>{getPercentageMultiDisplayLabel(modelKey)} recommendation</Text>
          <Text style={styles.multiContext}>
            {recommendations.length
              ? `${recommendations.length} ${sportLabel} fight card${recommendations.length === 1 ? "" : "s"} with same-card H2H legs`
              : `Needs at least ${MULTI_BET_MIN_LEGS} fully priced Head to Head fights on the same ${sportLabel} card`}
          </Text>
        </View>
      </View>

      {recommendations.length ? recommendations.map((recommendation) => {
        const locked = lockedMultis[recommendation.sourceCardId] ?? null;
        const disabledReason = locksEnabled
          ? getUfcLockDisabledReason({
              isLocked: Boolean(locked),
              isSignedIn: userIsSignedIn,
              recommendation,
            })
          : null;
        const isLocking = lockingCardId === recommendation.sourceCardId || isSigningIn;
        const isLockDisabled = Boolean(locked) || isLocking || Boolean(disabledReason && disabledReason !== "Sign in to lock");

        return (
          <View key={recommendation.sourceCardId} style={styles.ufcCardBlock}>
            <View style={styles.multiHeader}>
              <View style={styles.headerText}>
                <Text style={styles.multiTitle}>{recommendation.sourceCardName}</Text>
                <Text style={styles.multiContext}>
                  First fight {recommendation.firstFightStart ? formatDateTime(recommendation.firstFightStart) : "unknown"}
                </Text>
              </View>
              <View style={styles.multiActions}>
                <View style={[styles.signalBadge, styles[`signal_${recommendation.recommendationType}`]]}>
                  <Text style={styles.signalText}>
                    {recommendation.recommendationType === "positive" ? "Positive multi" : "Neutral multi"}
                  </Text>
                </View>
                {locksEnabled ? (
                  <>
                    <Pressable
                      disabled={isLockDisabled}
                      onPress={() => onLock(recommendation)}
                      style={[
                        styles.lockButton,
                        locked ? styles.lockButtonLocked : null,
                        isLockDisabled ? styles.lockButtonDisabled : null,
                      ]}
                    >
                      <Text style={[
                        styles.lockButtonText,
                        locked ? styles.lockButtonTextLocked : null,
                      ]}
                      >
                        {locked ? "Locked" : isLocking ? "Locking" : disabledReason === "Sign in to lock" ? "Sign in to lock" : "Lock"}
                      </Text>
                    </Pressable>
                    <Text style={styles.lockCutoffText}>
                      {formatLockCutoffLabel(recommendation.lockCutoffAt)}
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
            {locked ? (
              <Text style={styles.multiFooter}>Locked {formatDateTime(locked.lockedAt)}. This snapshot will stay active even if prices change.</Text>
            ) : disabledReason && disabledReason !== "Sign in to lock" ? (
              <Text style={styles.multiFooter}>{disabledReason}</Text>
            ) : null}
            <View style={styles.multiMetricRow}>
              <Metric label="Combined fixed win" value={formatCombinedFixedWinPrice(recommendation.combinedFixedWinPrice)} />
              <Metric label="Avg win score" value={formatPercentage(recommendation.averageWinScore)} />
            </View>
            <View style={styles.multiLegList}>
              {recommendation.legs.map((leg, index) => (
                <View key={leg.sourceEventId} style={styles.multiLeg}>
                  <View style={styles.multiLegIndex}>
                    <Text style={styles.multiLegIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.multiLegTextBlock}>
                    <View style={styles.multiLegTitleRow}>
                      <RaceDisciplineIcon code="ufc" size={16} />
                      <Text style={styles.multiLegTitle}>
                        {leg.predictedFighterName} vs {leg.otherFighterName}
                      </Text>
                    </View>
                    <Text style={styles.multiLegMeta}>
                      {formatDateTime(leg.advertisedStart)} · {formatCurrency(leg.predictedFixedWinPrice)} ·{" "}
                      {formatPercentage(leg.signal.score)} win score
                    </Text>
                    <Text style={styles.multiLegMeta}>
                      {leg.signal.bucketLabel ?? "Unknown bucket"} · {leg.signal.bucketSampleSize} samples · diff {formatCurrency(leg.priceDifference)}
                    </Text>
                  </View>
                  <Text style={[styles.multiLegSignal, styles[`signalText_${leg.signal.tone}`]]}>
                    {formatWinPercentageSignalLabel(leg.signal.tone)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      }) : (
        <Text style={styles.multiFooter}>
          {sportLabel} same-card multis will appear here once an eligible upcoming {sportLabel} card has at least {MULTI_BET_MIN_LEGS} fully priced H2H fights.
        </Text>
      )}
    </View>
  );
}

/**
 * Shows current UFC fight favourites as individual win-percentage single candidates.
 */
function UfcWinPercentageSinglesPanel({
  modelKey,
  modelRun,
  sportLabel = "UFC",
}: UfcWinPercentageSinglesPanelProps) {
  const candidates = getUfcSinglePredictionCandidates(modelRun);
  const candidateGroups = groupUfcSinglePredictionCandidatesByCard(candidates);

  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>{getPercentageMultiDisplayLabel(modelKey)} singles</Text>
          <Text style={styles.multiContext}>
            Each listed {sportLabel} favourite is shown as a separate current single from the selected historical bucket model.
          </Text>
        </View>
      </View>

      {candidateGroups.length ? (
        <View style={styles.multiLegList}>
          {candidateGroups.map((group) => (
            <View key={group.sourceCardId} style={styles.ufcSingleCardBlock}>
              <Text style={styles.ufcSingleCardTitle}>{group.sourceCardName}</Text>
              <Text style={styles.multiLegMeta}>
                First fight {formatDateTime(group.firstFightStart)}
              </Text>
              <View style={styles.ufcSingleCardLegList}>
                {group.candidates.map((candidate) => (
                  <View key={`${candidate.sourceCardId}-${candidate.sourceEventId}`} style={styles.multiLeg}>
                    <View style={styles.multiLegIndex}>
                      <Text style={styles.multiLegIndexText}>{candidate.predictionRank}</Text>
                    </View>
                    <View style={styles.multiLegTextBlock}>
                      <View style={styles.multiLegTitleRow}>
                        <RaceDisciplineIcon code="ufc" size={16} />
                        <Text style={styles.multiLegTitle}>
                          {candidate.predictedFighterName} vs {candidate.otherFighterName}
                        </Text>
                      </View>
                      <Text style={styles.multiLegMeta}>
                        {formatDateTime(candidate.advertisedStart)}
                      </Text>
                      <Text style={styles.multiLegMeta}>
                        Fixed win {formatCurrency(candidate.predictedFixedWinPrice)} · {formatPercentage(candidate.signal.score)} win score
                      </Text>
                      <Text style={styles.multiLegMeta}>
                        {candidate.signal.bucketLabel ?? "Unknown bucket"} · {candidate.signal.bucketSampleSize} samples · diff {formatCurrency(candidate.priceDifference)}
                      </Text>
                    </View>
                    <Text style={[styles.multiLegSignal, styles[`signalText_${candidate.signal.tone}`]]}>
                      {formatWinPercentageSignalLabel(candidate.signal.tone)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.multiFooter}>
          {sportLabel} single candidates will appear here once the current snapshot has eligible fully priced Head to Head fights for this model.
        </Text>
      )}
    </View>
  );
}

/**
 * Shows the derived same-model multi suggestion without storing or sizing a wager.
 */
function MultiBetRecommendationPanel({
  modelKey,
  recommendation,
}: MultiBetRecommendationPanelProps) {
  return (
    <View style={styles.multiPanel}>
      <View style={styles.multiHeader}>
        <View style={styles.headerText}>
          <Text style={styles.multiTitle}>Multi bet recommendation</Text>
          <Text style={styles.multiContext}>
            {recommendation
              ? `${recommendation.legs.length} ${recommendation.tone} signal legs from the active model`
              : `Needs at least ${MULTI_BET_MIN_LEGS} neutral-or-better legs from the active model`}
          </Text>
        </View>
        {recommendation ? (
          <View style={[styles.signalBadge, styles[`signal_${recommendation.tone}`]]}>
            <Text style={styles.signalText}>
              {recommendation.tone === "positive" ? "Positive multi" : "Neutral multi"}
            </Text>
          </View>
        ) : null}
      </View>

      {recommendation ? (
        <>
          <View style={styles.multiMetricRow}>
            <Metric
              label="Combined fixed win"
              value={formatCombinedFixedWinPrice(recommendation.combinedFixedWinPrice)}
            />
            <Metric
              label="Avg cash score"
              value={formatCurrency(getAverageCandidateScore(recommendation.legs, modelKey))}
            />
          </View>
          <View style={styles.multiLegList}>
            {recommendation.legs.map((race, index) => {
              const signal = getCandidateSignal(race, modelKey);

              return (
                <View key={race.raceCardId} style={styles.multiLeg}>
                  <View style={styles.multiLegIndex}>
                    <Text style={styles.multiLegIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.multiLegTextBlock}>
                    <View style={styles.multiLegTitleRow}>
                      <RaceDisciplineIcon code={race.code} size={16} />
                      <Text style={styles.multiLegTitle}>
                        R{race.raceNumber} {race.sourceTrack} · {formatMultiLegRunner(race)}
                      </Text>
                    </View>
                    <Text style={styles.multiLegMeta}>
                      {formatDateTime(race.advertisedStart)} · {race.country ?? "Unknown"} ·{" "}
                      {formatCurrency(race.favourite?.fixedWinPrice ?? null)} ·{" "}
                      {formatCurrency(getCandidateCashAverage(race, modelKey))} cash avg
                    </Text>
                  </View>
                  <Text style={[styles.multiLegSignal, styles[`signalText_${signal.tone}`]]}>
                    {signal.tone}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.multiFooter}>
            Statistical grouping only. No stake size or automated wagering action is provided.
          </Text>
        </>
      ) : (
        <Text style={styles.multiFooter}>
          Positive and neutral signals will appear here once the current snapshot has enough eligible priced legs.
        </Text>
      )}
    </View>
  );
}

/**
 * Orders current placing recommendations by place score, ignoring races with no place market.
 */
function buildPlacingRecommendations(candidates: BetCandidate[]) {
  return candidates
    .filter((candidate) =>
      candidate.placingCandidate
      && candidate.placingCandidate.placePayoutDepth > 0
      && Number.isFinite(candidate.placingCandidate.placeScore)
      && ["neutral", "positive"].includes(candidate.placingCandidate.tone))
    .sort((left, right) => {
      const rightScore = right.placingCandidate?.placeScore ?? -Infinity;
      const leftScore = left.placingCandidate?.placeScore ?? -Infinity;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return new Date(left.advertisedStart).valueOf()
        - new Date(right.advertisedStart).valueOf();
    })
    .slice(0, 8);
}

/**
 * Builds one active-model multi suggestion, preferring positive-only when enough legs exist.
 */
function buildMultiBetRecommendation(
  candidates: BetCandidate[],
  modelKey: string,
): MultiBetRecommendation | null {
  const eligibleCandidates = getUniquePricedCandidates(candidates, modelKey);
  const positiveLegs = eligibleCandidates.filter((candidate) =>
    getCandidateSignal(candidate, modelKey).tone === "positive");
  const positiveRecommendation = createMultiBetRecommendation(positiveLegs, "positive");

  if (positiveRecommendation) {
    return positiveRecommendation;
  }

  return createMultiBetRecommendation(
    eligibleCandidates.filter((candidate) => {
      const tone = getCandidateSignal(candidate, modelKey).tone;

      return tone === "neutral" || tone === "positive";
    }),
    "neutral",
  );
}

/**
 * Builds one dedicated percentage multi suggestion from the current snapshot.
 */
function buildPercentageMultiBetRecommendation(
  candidates: BetCandidate[],
  modelKey: WinPercentageMultiModelKey,
): MultiBetRecommendation | null {
  if (isPlacingPercentageMultiModel(modelKey)) {
    return buildPlacingPercentageMultiBetRecommendation(candidates);
  }

  const eligibleCandidates = getUniquePricedWinPercentageCandidates(
    candidates.map((candidate) => applyWinPercentageMultiModel(candidate, modelKey)),
  );
  const threshold = getWinPercentageMultiThreshold(modelKey);

  if (threshold !== null) {
    return createMultiBetRecommendation(
      eligibleCandidates.filter((candidate) =>
        Number(candidate.winPercentageMultiCandidate?.winScore ?? -Infinity) >= threshold),
      "positive",
      WIN_PERCENTAGE_THRESHOLD_MAX_LEGS,
    );
  }

  const positiveLegs = eligibleCandidates.filter((candidate) =>
    candidate.winPercentageMultiCandidate?.tone === "positive");
  const positiveRecommendation = createMultiBetRecommendation(positiveLegs, "positive");

  if (positiveRecommendation) {
    return positiveRecommendation;
  }

  return createMultiBetRecommendation(
    eligibleCandidates.filter((candidate) => {
      const tone = candidate.winPercentageMultiCandidate?.tone;

      return tone === "neutral" || tone === "positive";
    }),
    "neutral",
  );
}

/**
 * Derives alternate Win % model scores without changing the base snapshot signal.
 */
function applyWinPercentageMultiModel(candidate: BetCandidate, modelKey: WinPercentageMultiModelKey): BetCandidate {
  if (modelKey !== WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY || !candidate.winPercentageMultiCandidate) {
    return candidate;
  }

  const baseSignal = candidate.winPercentageMultiCandidate;
  const winScore = weightedAverage([
    {
      value: baseSignal.priceBucketWinPercentage ?? undefined,
      weight: 0.5,
    },
    {
      value: baseSignal.starterBucketWinPercentage ?? undefined,
      weight: 0.5,
    },
  ]);
  const signal = createWinPercentageMultiSignal(winScore, baseSignal.sampleSize);

  return {
    ...candidate,
    winPercentageMultiCandidate: {
      ...baseSignal,
      cashAverageScore: winScore,
      detail: signal.detail,
      label: signal.label,
      tone: signal.tone,
      winScore,
    },
  };
}

/**
 * Builds a placing-percentage multi from the strongest current place-rate signals.
 */
function buildPlacingPercentageMultiBetRecommendation(candidates: BetCandidate[]): MultiBetRecommendation | null {
  const eligibleCandidates = getUniquePricedPlacingPercentageCandidates(candidates);

  return createMultiBetRecommendation(
    eligibleCandidates,
    "positive",
    PLACING_PERCENTAGE_MAX_LEGS,
  );
}

/**
 * Returns the minimum blended win score for threshold-based win-percentage models.
 */
function getWinPercentageMultiThreshold(modelKey: WinPercentageMultiModelKey) {
  if (modelKey === WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY) {
    return 60;
  }

  if (modelKey === WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY) {
    return 65;
  }

  if (modelKey === WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY) {
    return 65;
  }

  return null;
}

/**
 * Identifies the multi model that uses placing percentage instead of win percentage.
 */
function isPlacingPercentageMultiModel(modelKey: WinPercentageMultiModelKey) {
  return modelKey === PLACING_PERCENTAGE_MULTI_MODEL_KEY;
}

/**
 * Names the active percentage multi in lock and status copy.
 */
function getPercentageMultiDisplayLabel(modelKey: WinPercentageMultiModelKey) {
  if (modelKey === PLACING_PERCENTAGE_MULTI_MODEL_KEY) {
    return "place percentage multi";
  }

  if (isUfcPercentageMultiModel(modelKey)) {
    return WIN_PERCENTAGE_MULTI_MODEL_LABELS[modelKey] ?? "UFC win percentage multi";
  }

  if (isPflPercentageMultiModel(modelKey)) {
    return WIN_PERCENTAGE_MULTI_MODEL_LABELS[modelKey] ?? "PFL win percentage multi";
  }

  if (modelKey === WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY) {
    return "50/50 65%+ win percentage multi";
  }

  const threshold = getWinPercentageMultiThreshold(modelKey);

  return threshold ? `${threshold}%+ win percentage multi` : "win percentage multi";
}

/**
 * Uses backend win-percentage candidates when present, otherwise derives them from legacy snapshot buckets.
 */
function getWinPercentageMultiCandidatePool(
  scan: RecommendationPayload["betBackCandidates"],
  fallbackCandidates: BetCandidate[],
) {
  if (scan?.winPercentageMultiCandidates?.length) {
    return scan.winPercentageMultiCandidates;
  }

  return fallbackCandidates.map(addWinPercentageMultiCandidateFallback);
}

/**
 * Adds the multi-only win-rate signal to snapshots generated before the backend included it.
 */
function addWinPercentageMultiCandidateFallback(candidate: BetCandidate): BetCandidate {
  if (candidate.winPercentageMultiCandidate) {
    return candidate;
  }

  const priceBucket = candidate.historical.priceBucket;
  const starterBucket = candidate.historical.starterBucket;
  const winScore = weightedAverage([
    {
      value: priceBucket?.favouriteSelections ? priceBucket.winPercentage : undefined,
      weight: 0.65,
    },
    {
      value: starterBucket?.favouriteSelections ? starterBucket.winPercentage : undefined,
      weight: 0.35,
    },
  ]);
  const sampleSize = (priceBucket?.favouriteSelections ?? 0) + (starterBucket?.favouriteSelections ?? 0);
  const signal = createWinPercentageMultiSignal(winScore, sampleSize);

  return {
    ...candidate,
    winPercentageMultiCandidate: {
      cashAverageScore: winScore,
      detail: signal.detail,
      label: signal.label,
      priceBucketLabel: priceBucket?.label ?? candidate.favourite?.priceBucket ?? null,
      priceBucketWinPercentage: priceBucket?.favouriteSelections ? priceBucket.winPercentage : null,
      sampleSize,
      starterBucketLabel: starterBucket?.label ?? (candidate.starters ? `${candidate.starters} starters` : null),
      starterBucketWinPercentage: starterBucket?.favouriteSelections ? starterBucket.winPercentage : null,
      tone: signal.tone,
      winScore,
    },
  };
}

/**
 * Classifies win-rate multi signals using the same thresholds as the backend model.
 */
function createWinPercentageMultiSignal(score: number | null, sampleSize: number) {
  if (score === null) {
    return {
      detail: "Matching historical win-rate data is limited.",
      label: "Limited win-rate history",
      tone: "neutral" as const,
    };
  }

  if (sampleSize < 10) {
    return {
      detail: "Historical win-rate data is available, but the sample size is small.",
      label: "Small win-rate sample",
      tone: "neutral" as const,
    };
  }

  if (score >= 50) {
    return {
      detail: "Historical win rate is at least 50% for the matching favourite price and starter buckets.",
      label: "Positive win-rate signal",
      tone: "positive" as const,
    };
  }

  if (score >= 40) {
    return {
      detail: "Historical win rate is at least 40% for the matching favourite price and starter buckets.",
      label: "Neutral win-rate signal",
      tone: "neutral" as const,
    };
  }

  return {
    detail: "Historical win rate is below 40% for the matching favourite price and starter buckets.",
    label: "Weak win-rate signal",
    tone: "caution" as const,
  };
}

/**
 * Dedupes win-percentage candidates by source race and keeps the strongest leg.
 */
function getUniquePricedWinPercentageCandidates(candidates: BetCandidate[]) {
  const bestByRace = new Map<string, BetCandidate>();

  for (const candidate of candidates) {
    const signal = candidate.winPercentageMultiCandidate;

    if (
      !candidate.favourite?.fixedWinPrice
      || !signal
      || !["neutral", "positive"].includes(signal.tone)
    ) {
      continue;
    }

    const existing = bestByRace.get(candidate.raceCardId);

    if (!existing || compareWinPercentageCandidates(candidate, existing) < 0) {
      bestByRace.set(candidate.raceCardId, candidate);
    }
  }

  return Array.from(bestByRace.values()).sort(compareWinPercentageCandidates);
}

/**
 * Selects every current favourite eligible for the selected win-rate singles tracker.
 */
function getWinPercentageSingleCandidates(candidates: BetCandidate[], modelKey: PredictionModelKey) {
  const bestByRace = new Map<string, BetCandidate>();
  const threshold = getSingleWinPercentageThreshold(modelKey);

  for (const candidate of candidates) {
    const signal = candidate.winPercentageMultiCandidate;

    if (
      !candidate.favourite?.fixedWinPrice
      || !signal
      || Number(signal.winScore ?? -Infinity) < threshold
    ) {
      continue;
    }

    const existing = bestByRace.get(candidate.raceCardId);

    if (!existing || compareWinPercentageCandidates(candidate, existing) < 0) {
      bestByRace.set(candidate.raceCardId, candidate);
    }
  }

  return Array.from(bestByRace.values()).sort(compareWinPercentageCandidates);
}

/**
 * Maps racing single win-percentage model keys to their threshold.
 */
function getSingleWinPercentageThreshold(modelKey: PredictionModelKey) {
  return modelKey === SINGLE_WIN_PERCENTAGE_60_PLUS_MODEL_KEY ? 60 : 65;
}

/**
 * Reads UFC single candidates from new snapshots, or derives them from stored multi legs in older snapshots.
 */
function getUfcSinglePredictionCandidates(modelRun: UfcWinPercentageMultiModelRun | null) {
  if (!modelRun) {
    return [];
  }

  if (modelRun.singleCandidates?.length) {
    return [...modelRun.singleCandidates].sort(compareUfcSinglePredictionCandidates);
  }

  return modelRun.recommendations
    .flatMap((recommendation) =>
      recommendation.legs.map((leg): UfcSinglePredictionCandidate => ({
        ...leg,
        sourceCardId: recommendation.sourceCardId,
        sourceCardName: recommendation.sourceCardName,
        sourceCardSlug: recommendation.sourceCardSlug,
      })))
    .sort(compareUfcSinglePredictionCandidates);
}

/**
 * Groups UFC singles by fight night while preserving their model rank labels.
 */
function groupUfcSinglePredictionCandidatesByCard(candidates: UfcSinglePredictionCandidate[]) {
  const groups = new Map<string, {
    candidates: UfcSinglePredictionCandidate[];
    firstFightStart: string;
    sourceCardId: string;
    sourceCardName: string;
  }>();

  for (const candidate of candidates) {
    const existing = groups.get(candidate.sourceCardId);

    if (existing) {
      existing.candidates.push(candidate);

      if (compareIsoDate(candidate.advertisedStart, existing.firstFightStart) < 0) {
        existing.firstFightStart = candidate.advertisedStart;
      }

      continue;
    }

    groups.set(candidate.sourceCardId, {
      candidates: [candidate],
      firstFightStart: candidate.advertisedStart,
      sourceCardId: candidate.sourceCardId,
      sourceCardName: candidate.sourceCardName,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      candidates: group.candidates.sort(compareUfcSinglePredictionCandidatesWithinCard),
    }))
    .sort((left, right) => {
      const startComparison = compareIsoDate(left.firstFightStart, right.firstFightStart);

      if (startComparison !== 0) {
        return startComparison;
      }

      return left.sourceCardName.localeCompare(right.sourceCardName);
    });
}

/**
 * Orders UFC singles by fight night, then advertised start, then model rank.
 */
function compareUfcSinglePredictionCandidates(
  left: UfcSinglePredictionCandidate,
  right: UfcSinglePredictionCandidate,
) {
  const cardComparison = left.sourceCardName.localeCompare(right.sourceCardName);

  if (cardComparison !== 0) {
    return cardComparison;
  }

  return compareUfcSinglePredictionCandidatesWithinCard(left, right);
}

/**
 * Orders UFC singles inside one fight night by scheduled fight time, then model rank.
 */
function compareUfcSinglePredictionCandidatesWithinCard(
  left: UfcSinglePredictionCandidate,
  right: UfcSinglePredictionCandidate,
) {
  const startComparison = compareIsoDate(left.advertisedStart, right.advertisedStart);

  if (startComparison !== 0) {
    return startComparison;
  }

  if (left.predictionRank !== right.predictionRank) {
    return left.predictionRank - right.predictionRank;
  }

  return left.fightName.localeCompare(right.fightName);
}

/**
 * Compares ISO-ish timestamps while keeping invalid values stable at the end.
 */
function compareIsoDate(left: string | null | undefined, right: string | null | undefined) {
  const leftTime = new Date(left ?? "").valueOf();
  const rightTime = new Date(right ?? "").valueOf();
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY;

  return safeLeftTime - safeRightTime;
}

/**
 * Dedupes placing candidates by source race and keeps the strongest place-rate leg.
 */
function getUniquePricedPlacingPercentageCandidates(candidates: BetCandidate[]) {
  const bestByRace = new Map<string, BetCandidate>();

  for (const candidate of candidates) {
    const signal = candidate.placingCandidate;

    if (
      !candidate.favourite?.fixedWinPrice
      || !signal
      || signal.placePayoutDepth <= 0
      || !Number.isFinite(signal.placeScore)
      || !["neutral", "positive"].includes(signal.tone)
    ) {
      continue;
    }

    const existing = bestByRace.get(candidate.raceCardId);

    if (!existing || comparePlacingPercentageCandidates(candidate, existing) < 0) {
      bestByRace.set(candidate.raceCardId, candidate);
    }
  }

  return Array.from(bestByRace.values()).sort(comparePlacingPercentageCandidates);
}

/**
 * Orders win-percentage multi legs by score, then by earliest advertised start.
 */
function compareWinPercentageCandidates(left: BetCandidate, right: BetCandidate) {
  const rightScore = right.winPercentageMultiCandidate?.winScore ?? -Infinity;
  const leftScore = left.winPercentageMultiCandidate?.winScore ?? -Infinity;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return new Date(left.advertisedStart).valueOf()
    - new Date(right.advertisedStart).valueOf();
}

/**
 * Orders placing multi legs by place score, then by earliest advertised start.
 */
function comparePlacingPercentageCandidates(left: BetCandidate, right: BetCandidate) {
  const rightScore = right.placingCandidate?.placeScore ?? -Infinity;
  const leftScore = left.placingCandidate?.placeScore ?? -Infinity;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return new Date(left.advertisedStart).valueOf()
    - new Date(right.advertisedStart).valueOf();
}

/**
 * Dedupes candidates by source race and keeps the strongest priced leg for each race.
 */
function getUniquePricedCandidates(candidates: BetCandidate[], modelKey: string) {
  const bestByRace = new Map<string, BetCandidate>();

  for (const candidate of candidates) {
    const signal = getCandidateSignal(candidate, modelKey);

    if (
      !candidate.favourite?.fixedWinPrice
      || !["neutral", "positive"].includes(signal.tone)
    ) {
      continue;
    }

    const existing = bestByRace.get(candidate.raceCardId);

    if (!existing || compareCandidates(candidate, existing, modelKey) < 0) {
      bestByRace.set(candidate.raceCardId, candidate);
    }
  }

  return Array.from(bestByRace.values()).sort((left, right) => compareCandidates(left, right, modelKey));
}

/**
 * Creates a capped multi recommendation when the candidate list has the required minimum.
 */
function createMultiBetRecommendation(
  candidates: BetCandidate[],
  tone: MultiBetRecommendation["tone"],
  maxLegs = MULTI_BET_MAX_LEGS,
  minLegs = MULTI_BET_MIN_LEGS,
): MultiBetRecommendation | null {
  if (candidates.length < minLegs) {
    return null;
  }

  const legs = candidates.slice(0, maxLegs);
  const combinedFixedWinPrice = legs.reduce<number | null>((total, race) => {
    const price = race.favourite?.fixedWinPrice;

    if (!total || typeof price !== "number" || !Number.isFinite(price)) {
      return null;
    }

    return total * price;
  }, 1);

  return {
    combinedFixedWinPrice,
    legs,
    tone,
  };
}

/**
 * Rehydrates a user-locked snapshot into the same display shape as the live recommendation.
 */
function createRecommendationFromLockedWinPercentageMulti(
  locked: LockedWinPercentageMultiRecommendation,
): MultiBetRecommendation {
  return {
    combinedFixedWinPrice: locked.combinedFixedWinPrice,
    legs: locked.legs,
    tone: locked.tone,
  };
}

/**
 * Orders candidate legs by active-model score, then by earliest advertised start.
 */
function compareCandidates(left: BetCandidate, right: BetCandidate, modelKey: string) {
  const rightScore = getCandidateModelScore(right, modelKey) ?? -Infinity;
  const leftScore = getCandidateModelScore(left, modelKey) ?? -Infinity;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return new Date(left.advertisedStart).valueOf()
    - new Date(right.advertisedStart).valueOf();
}

/**
 * Groups current bet candidates into stable country/discipline sections for scanning.
 */
function groupBetCandidatesByCountryAndDiscipline(candidates: BetCandidate[], modelKey: string) {
  const labels = {
    greyhound: "Greyhound",
    harness: "Harness",
    horse: "Horse",
  } satisfies Record<"greyhound" | "harness" | "horse", string>;
  const disciplineOrder = ["horse", "harness", "greyhound"];
  const grouped = new Map<string, BetCandidate[]>();

  for (const candidate of candidates) {
    const country = candidate.country ?? "Unknown";
    const groupKey = `${country}:${candidate.code}`;
    const matchingCandidates = grouped.get(groupKey) ?? [];
    matchingCandidates.push(candidate);
    grouped.set(groupKey, matchingCandidates);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => {
      const [leftCountry, leftCode] = left.split(":");
      const [rightCountry, rightCode] = right.split(":");
      const countrySort = leftCountry.localeCompare(rightCountry);

      if (countrySort !== 0) {
        return countrySort;
      }

      const leftIndex = disciplineOrder.indexOf(leftCode);
      const rightIndex = disciplineOrder.indexOf(rightCode);

      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }

      return leftCode.localeCompare(rightCode);
    })
    .map(([code, groupCandidates]) => {
      const [country, disciplineCode] = code.split(":");

      return {
        candidates: groupCandidates
          .sort((left, right) => {
            return compareCandidates(left, right, modelKey);
          })
          .map((candidate, index) => ({
            ...candidate,
            rank: index + 1,
          })),
        code,
        label: `${country} ${disciplineCode in labels
          ? labels[disciplineCode as keyof typeof labels]
          : disciplineCode}`,
      };
    });
}

/**
 * Reads the active model signal state, falling back to the snapshot's default candidate signal.
 */
function getCandidateSignal(race: BetCandidate, modelKey: string) {
  return race.predictionModels?.[modelKey] ?? race.candidate;
}

/**
 * Reads the active model score used for recommendation ordering.
 */
function getCandidateModelScore(race: BetCandidate, modelKey: string) {
  return race.predictionModels?.[modelKey]?.cashAverageScore
    ?? race.candidate.cashAverageScore
    ?? getCandidateCashAverage(race, modelKey);
}

/**
 * Estimates the cash return per $1 from available cash-return history when snapshots predate cashAverageScore.
 */
function getCandidateCashAverage(race: BetCandidate, modelKey: string) {
  return race.predictionModels?.[modelKey]?.cashAverageScore
    ?? race.candidate.cashAverageScore
    ?? getOtherStartersAverageCashAverage(race, modelKey)
    ?? weightedAverage(getCashReturnWeights(modelKey).map(({ field, weight }) => ({
      value: field === "price"
        ? race.historical.priceBucket?.averageReturnPerDollar
        : race.historical.starterBucket?.averageReturnPerDollar,
      weight,
    })));
}

function isPredictionWindowClosedError(error: Error) {
  return error.message.includes("Prediction window closed");
}

/**
 * Appends the active model's metric basis to generic recommendation labels.
 */
function formatCandidatePillLabel(label: string, modelKey: string) {
  const baseLabel = label.replace(/ candidate$/i, "");

  if (!["Positive", "Neutral", "Weak"].includes(baseLabel)) {
    return label;
  }

  return `${baseLabel} ${getCandidatePillMetricLabel(modelKey)}`;
}

function formatPlacingSignalLabel(tone: NonNullable<BetCandidate["placingCandidate"]>["tone"] | undefined) {
  if (tone === "positive") {
    return "Positive place";
  }

  if (tone === "neutral") {
    return "Neutral place";
  }

  if (tone === "caution") {
    return "Weak place";
  }

  return "Place";
}

/**
 * Keeps status pill wording aligned to the active prediction model's cash score.
 */
function getCandidatePillMetricLabel(modelKey: string) {
  if (
    modelKey === "global_bucket_blend_v1"
    || modelKey === "global_bucket_cash_blend_v1"
  ) {
    return "cash blend";
  }

  if (modelKey === "global_bucket_cash_even_blend_v1") {
    return "cash 50/50";
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return "price cash";
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return "starter cash";
  }

  if (modelKey === "global_other_starters_average_price_cash_v1") {
    return "other avg cash";
  }

  if (modelKey === "country_code_bucket_blend_shrunk_v1") {
    return "scoped cash";
  }

  if (modelKey === "country_code_distance_condition_v1") {
    return "condition cash";
  }

  return "cash";
}

/**
 * Reads the other-starters average price cash bucket for legacy snapshots.
 */
function getOtherStartersAverageCashAverage(race: BetCandidate, modelKey: string) {
  return modelKey === "global_other_starters_average_price_cash_v1"
    ? race.historical.otherStartersAveragePriceBucket?.averageReturnPerDollar ?? null
    : null;
}

/**
 * Provides cash-only fallback weights for snapshots created before model-specific cash scores existed.
 */
function getCashReturnWeights(modelKey: string) {
  if (
    modelKey === "global_bucket_blend_v1"
    || modelKey === "global_bucket_cash_blend_v1"
    || modelKey === "country_code_bucket_blend_shrunk_v1"
    || modelKey === "country_code_distance_condition_v1"
  ) {
    return [
      {
        field: "price" as const,
        weight: 0.65,
      },
      {
        field: "starter" as const,
        weight: 0.35,
      },
    ];
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return [
      {
        field: "price" as const,
        weight: 1,
      },
      {
        field: "starter" as const,
        weight: 0,
      },
    ];
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return [
      {
        field: "price" as const,
        weight: 0,
      },
      {
        field: "starter" as const,
        weight: 1,
      },
    ];
  }

  return [
    {
      field: "price" as const,
      weight: 0.5,
    },
    {
      field: "starter" as const,
      weight: 0.5,
    },
  ];
}

/**
 * Combines available numeric metric values and renormalises when one bucket is missing.
 */
function weightedAverage(entries: { value: number | undefined; weight: number }[]) {
  const usableEntries = entries.filter((entry): entry is { value: number; weight: number } =>
    typeof entry.value === "number" && Number.isFinite(entry.value),
  );
  const totalWeight = usableEntries.reduce((total, entry) => total + entry.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return usableEntries.reduce((total, entry) => total + (entry.value * entry.weight), 0) / totalWeight;
}

function createSnapshotFromPayload(payload: RecommendationPayload) {
  return {
    generatedAt: payload.generatedAt,
    generatedAtNz: payload.generatedAtNz ?? null,
    payload,
    sourceDate: payload.sourceDate,
    sourceTable: "current_prediction_snapshots" as const,
  };
}

function PredictionFinalisationNotice({ status }: { status: PredictionFinalisationStatus }) {
  const label = status.finalisesAt
    ? `Prediction ${status.finalised ? "finalised" : "finalises"} before ${formatDateTime(status.finalisesAt)}`
    : `${status.sportLabel} prediction finalisation time unavailable`;

  const detail = status.firstStartAt
    ? `15 minutes before first ${getSportStartLabel(status.sportLabel)} at ${formatDateTime(status.firstStartAt)}`
    : "Finalisation uses the first race, fight, or match once start times are available.";

  return (
    <View style={[
      styles.finalisationNotice,
      status.finalised ? styles.finalisationNoticeClosed : null,
    ]}>
      <Text style={styles.finalisationTitle}>{label}</Text>
      <Text style={styles.finalisationText}>{detail}</Text>
    </View>
  );
}

function CurrentPredictionLockControl({
  disabledReason,
  isLocked,
  isLocking,
  lockedAt,
  onLock,
}: {
  disabledReason: string | null;
  isLocked: boolean;
  isLocking: boolean;
  lockedAt: string | null;
  onLock: () => void;
}) {
  const isDisabled = isLocked || isLocking || Boolean(disabledReason && disabledReason !== "Sign in to lock");

  return (
    <View style={styles.currentLockRow}>
      <Pressable
        disabled={isDisabled}
        onPress={onLock}
        style={[
          styles.lockButton,
          isLocked ? styles.lockButtonLocked : null,
          isDisabled ? styles.lockButtonDisabled : null,
        ]}
      >
        <Text style={[
          styles.lockButtonText,
          isLocked ? styles.lockButtonTextLocked : null,
        ]}
        >
          {isLocked ? "Locked" : isLocking ? "Locking" : disabledReason === "Sign in to lock" ? "Sign in to lock" : "Lock current view"}
        </Text>
      </Pressable>
      <Text style={styles.currentLockText}>
        {isLocked && lockedAt
          ? `Locked ${formatDateTime(lockedAt)}`
          : disabledReason ?? "Save this exact prediction view before it finalises."}
      </Text>
    </View>
  );
}

function PredictionNotificationControl({
  enabled,
  isSaving,
  onToggle,
  userIsSignedIn,
}: {
  enabled: boolean;
  isSaving: boolean;
  onToggle: () => void;
  userIsSignedIn: boolean;
}) {
  const iconName = enabled ? "notifications" : "notifications-outline";

  return (
    <View style={styles.currentLockRow}>
      <Pressable
        disabled={isSaving}
        onPress={onToggle}
        style={[
          styles.notificationButton,
          enabled ? styles.notificationButtonEnabled : null,
          isSaving ? styles.lockButtonDisabled : null,
        ]}
      >
        <Ionicons
          color={enabled ? "#166534" : "#344054"}
          name={iconName}
          size={15}
        />
        <Text style={[
          styles.notificationButtonText,
          enabled ? styles.notificationButtonTextEnabled : null,
        ]}
        >
          {isSaving
            ? "Saving"
            : enabled
              ? "Notifications on"
              : userIsSignedIn
                ? "Notify when finalised"
                : "Sign in for alerts"}
        </Text>
      </Pressable>
      <Text style={styles.currentLockText}>
        {enabled
          ? "This model will notify once it finalises with an active prediction."
          : "Favourite this model to get a mobile alert after finalisation."}
      </Text>
    </View>
  );
}

function getUnavailableMessage(status: BetCandidateStatus) {
  if (status === "loading") {
    return "Checking Supabase for the latest candidate snapshot.";
  }

  if (status === "unconfigured") {
    return "Bet candidates require EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_SUPABASE_KEY, or EXPO_PUBLIC_SUPABASE_ANON_KEY.";
  }

  if (status === "empty") {
      return "Run the prediction refresh Edge Function or wait for the next scheduled refresh to populate current_prediction_snapshots.";
  }

  return "Bet candidates could not be loaded from Supabase.";
}

function getCurrentPredictionLockDisabledReason({
  finalisesAt,
  hasCurrentView,
  isLocked,
  isSignedIn,
  sourceDate,
}: {
  finalisesAt: string | null;
  hasCurrentView: boolean;
  isLocked: boolean;
  isSignedIn: boolean;
  sourceDate: string | null;
}) {
  if (isLocked) {
    return "Already locked";
  }

  if (!hasCurrentView || !sourceDate) {
    return "Load current predictions before locking";
  }

  if (!isSignedIn) {
    return "Sign in to lock";
  }

  if (!finalisesAt) {
    return "Finalisation time unavailable";
  }

  if (!isBeforeLockCutoff(finalisesAt)) {
    return "Locking closed for this sport";
  }

  return null;
}

function isSnapshotStale(value: string | null) {
  if (!value) {
    return true;
  }

  const generatedAt = new Date(value).valueOf();

  return Number.isNaN(generatedAt) || Date.now() - generatedAt > PROMOTION_CACHE_MAX_AGE_MS;
}

/**
 * Treats server-closed windows and locally elapsed finalisation times as locked snapshots.
 */
function isPredictionWindowClosedNow(window: RecommendationPayload["predictionWindow"] | undefined) {
  if (!window) {
    return false;
  }

  if (window.isClosed || window.status === "closed") {
    return true;
  }

  const finalisesAt = window.finalisesAt ?? getPredictionFinalisesAt(window.firstRaceStart);

  if (!finalisesAt) {
    return false;
  }

  const finalisesAtTime = new Date(finalisesAt).valueOf();

  return Number.isFinite(finalisesAtTime) && Date.now() >= finalisesAtTime;
}

/**
 * Calculates the visible finalisation status for the selected sport's current data.
 */
function getPredictionFinalisationStatus({
  npcPredictions,
  nrlPredictions,
  payload,
  predictionSport,
}: {
  npcPredictions: NpcSinglePredictionsResult | null;
  nrlPredictions: NrlSinglePredictionsResult | null;
  payload: RecommendationPayload | null;
  predictionSport: PredictionSport;
}): PredictionFinalisationStatus {
  const sportLabel = getSportLabel(predictionSport);

  if (predictionSport === "racing") {
    const firstStartAt = payload?.predictionWindow?.firstRaceStart
      ?? payload?.betBackCandidates?.firstEligibleRaceStart
      ?? null;
    const finalisesAt = payload?.predictionWindow?.finalisesAt
      ?? getPredictionFinalisesAt(firstStartAt);

    return {
      finalised: isFinalised(finalisesAt),
      finalisesAt,
      firstStartAt,
      sportLabel,
    };
  }

  if (predictionSport === "ufc" || predictionSport === "pfl") {
    const fightPayload = predictionSport === "ufc"
      ? payload?.ufcWinPercentageMultis
      : payload?.pflWinPercentageMultis;
    const firstStartAt = fightPayload?.firstFightStart
      ?? getEarliestIsoDate((fightPayload?.models ?? []).flatMap((model) => [
        ...model.recommendations.map((recommendation) => recommendation.firstFightStart),
        ...(model.singleCandidates ?? []).map((candidate) => candidate.advertisedStart),
      ]));
    const finalisesAt = fightPayload?.finalisesAt ?? getPredictionFinalisesAt(firstStartAt);

    return {
      finalised: isFinalised(finalisesAt),
      finalisesAt,
      firstStartAt,
      sportLabel,
    };
  }

  const teamSportPredictions = predictionSport === "npc" ? npcPredictions : nrlPredictions;
  const firstStartAt = getEarliestIsoDate(teamSportPredictions?.predictions.map((prediction) =>
    prediction.advertisedStartAt) ?? []);
  const finalisesAt = getPredictionFinalisesAt(firstStartAt);

  return {
    finalised: isFinalised(finalisesAt),
    finalisesAt,
    firstStartAt,
    sportLabel,
  };
}

function getCurrentPredictionModel({
  npcSinglePredictionModelKey,
  nrlSinglePredictionModelKey,
  predictionFormat,
  predictionModelKey,
  predictionSport,
  predictionType,
  winPercentageMultiModelKey,
}: {
  npcSinglePredictionModelKey: NpcSinglePredictionModelKey;
  nrlSinglePredictionModelKey: NrlSinglePredictionModelKey;
  predictionFormat: PredictionFormat;
  predictionModelKey: PredictionModelKey;
  predictionSport: PredictionSport;
  predictionType: CurrentPredictionType;
  winPercentageMultiModelKey: WinPercentageMultiModelKey;
}) {
  if (predictionSport === "nrl") {
    return nrlSinglePredictionModelKey;
  }

  if (predictionSport === "npc") {
    return npcSinglePredictionModelKey;
  }

  if (predictionSport === "ufc" || predictionSport === "pfl") {
    return winPercentageMultiModelKey;
  }

  if (predictionFormat === "multis" || predictionType === "placing") {
    return winPercentageMultiModelKey;
  }

  return predictionModelKey;
}

function getPredictionFinalisesAt(firstStart: string | null | undefined) {
  if (!firstStart) {
    return null;
  }

  const startTime = new Date(firstStart).valueOf();

  if (!Number.isFinite(startTime)) {
    return null;
  }

  return new Date(startTime - PREDICTION_FINALISATION_BUFFER_MS).toISOString();
}

function getEarliestIsoDate(values: (string | null | undefined)[]) {
  const timestamps = values
    .map((value) => value ? new Date(value).valueOf() : Number.NaN)
    .filter((value) => Number.isFinite(value));

  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function isFinalised(finalisesAt: string | null) {
  if (!finalisesAt) {
    return false;
  }

  const finalisesAtTime = new Date(finalisesAt).valueOf();

  return Number.isFinite(finalisesAtTime) && Date.now() >= finalisesAtTime;
}

function getSportLabel(sport: PredictionSport) {
  if (sport === "ufc") {
    return "UFC";
  }

  if (sport === "pfl") {
    return "PFL";
  }

  if (sport === "nrl") {
    return "NRL";
  }

  if (sport === "npc") {
    return "NPC";
  }

  return "Racing";
}

function getSportStartLabel(sportLabel: string) {
  if (sportLabel === "Racing") {
    return "race";
  }

  if (sportLabel === "NRL" || sportLabel === "NPC") {
    return "match";
  }

  return "fight";
}

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

function formatCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

/**
 * Formats a placing recommendation bucket label with its place cash average.
 */
function formatBucketWithCashAverage(label: string | null | undefined, cashAverage: number | null | undefined) {
  const bucketLabel = label || "-";

  return `${bucketLabel} (${formatCurrency(cashAverage ?? null)})`;
}

/**
 * Formats a win-percentage multi bucket label with its historical win rate.
 */
function formatBucketWithWinPercentage(label: string | null | undefined, winPercentage: number | null | undefined) {
  const bucketLabel = label || "-";

  return `${bucketLabel} (${formatPercentage(winPercentage ?? null)})`;
}

/**
 * Formats the displayed combined decimal price for the selected multi legs.
 */
function formatCombinedFixedWinPrice(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(2)}x`;
}

/**
 * Formats a multi leg runner while tolerating malformed legacy snapshots.
 */
function formatMultiLegRunner(race: BetCandidate) {
  if (!race.favourite) {
    return "Favourite unavailable";
  }

  return `#${race.favourite.number} ${race.favourite.name}`;
}

/**
 * Averages available active-model cash scores across a displayed multi.
 */
function getAverageCandidateScore(candidates: BetCandidate[], modelKey: string) {
  const scores = candidates
    .map((candidate) => getCandidateCashAverage(candidate, modelKey))
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (!scores.length) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

/**
 * Averages available percentage scores across a displayed multi.
 */
function getAveragePercentageMultiScore(candidates: BetCandidate[], modelKey: WinPercentageMultiModelKey) {
  const scores = candidates
    .map((candidate) => isPlacingPercentageMultiModel(modelKey)
      ? candidate.placingCandidate?.placeScore
      : candidate.winPercentageMultiCandidate?.winScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (!scores.length) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function formatWinPercentageSignalLabel(
  tone: NonNullable<BetCandidate["winPercentageMultiCandidate"]>["tone"] | undefined,
) {
  if (tone === "positive") {
    return "positive";
  }

  if (tone === "neutral") {
    return "neutral";
  }

  if (tone === "caution") {
    return "weak";
  }

  return "win-rate";
}

function formatOtherStartersPriceShape(race: BetCandidate) {
  const shape = race.fieldPriceShape;

  if (!shape) {
    return undefined;
  }

  const outlierDetail = shape.otherStartersPriceOutlierCount
    ? ` · ${shape.otherStartersPriceOutlierCount} at $${shape.outlierCutoff}+ excluded`
    : "";

  return `${shape.otherStartersAveragePriceBucket ?? "No bucket"} · ${shape.otherStartersPriceCount} prices${outlierDetail}`;
}

function formatPercentage(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

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

function getWinPercentageLockDisabledReason({
  isLocked,
  isSignedIn,
  lockCutoffAt,
  recommendation,
}: {
  isLocked: boolean;
  isSignedIn: boolean;
  lockCutoffAt: string | null;
  recommendation: MultiBetRecommendation | null;
}) {
  if (isLocked) {
    return "Already locked";
  }

  if (!recommendation) {
    return "No percentage multi to lock";
  }

  if (!isSignedIn) {
    return "Sign in to lock";
  }

  if (!lockCutoffAt) {
    return "Locking requires a prediction finalisation time";
  }

  if (!isBeforeLockCutoff(lockCutoffAt)) {
    return "Locking closed when predictions finalised";
  }

  return null;
}

function getUfcLockDisabledReason({
  isLocked,
  isSignedIn,
  recommendation,
}: {
  isLocked: boolean;
  isSignedIn: boolean;
  recommendation: UfcMultiRecommendation;
}) {
  if (isLocked) {
    return "Already locked";
  }

  if (!recommendation.legs.length) {
    return "No UFC multi to lock";
  }

  if (!isSignedIn) {
    return "Sign in to lock";
  }

  if (!isBeforeLockCutoff(recommendation.lockCutoffAt)) {
    return "Locking closed for this fight card";
  }

  return null;
}

function isBeforeLockCutoff(value: string | null, now = new Date()) {
  if (!value) {
    return false;
  }

  const cutoff = new Date(value).valueOf();

  return Number.isFinite(cutoff) && now.valueOf() < cutoff;
}

function formatLockCutoffLabel(value: string | null) {
  return value ? `Locks before ${formatDateTime(value)}` : "Lock cutoff unavailable";
}

/**
 * Uses the snapshot's racing prediction window as the manual lock cutoff.
 */
function getRacingLockCutoffAt(payload: RecommendationPayload | null) {
  return payload?.predictionWindow?.finalisesAt
    ?? getPredictionFinalisesAt(payload?.predictionWindow?.firstRaceStart)
    ?? getPredictionFinalisesAt(payload?.betBackCandidates?.firstEligibleRaceStart)
    ?? null;
}

function createLockedWinPercentageMultiInput(
  payload: RecommendationPayload,
  recommendation: MultiBetRecommendation,
  modelKey: WinPercentageMultiModelKey,
) {
  return {
    averageScore: getAveragePercentageMultiScore(recommendation.legs, modelKey),
    combinedFixedWinPrice: recommendation.combinedFixedWinPrice,
    generatedAt: payload.generatedAt,
    generatedAtNz: payload.generatedAtNz ?? null,
    legs: recommendation.legs,
    lockCutoffAt: getRacingLockCutoffAt(payload),
    raw: {
      generatedAt: payload.generatedAt,
      lockCutoffAt: getRacingLockCutoffAt(payload),
      recommendationType: recommendation.tone,
      sourceDate: payload.sourceDate,
      sourceTimeZone: payload.sourceTimeZone ?? SOURCE_TIME_ZONE,
    },
    recommendationType: recommendation.tone,
    source: payload.betBackCandidates?.source ?? "betcha",
    sourceDate: payload.sourceDate,
    sourceTimeZone: payload.sourceTimeZone ?? SOURCE_TIME_ZONE,
  };
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

function createCandidateBetInput({
  payload,
  race,
}: {
  payload: RecommendationPayload;
  race: BetCandidate;
}): UserRaceBetInput {
  const runner = getTrackableRunner(race);

  return {
    advertisedStart: race.advertisedStart,
    bookmaker: "betcha",
    country: null,
    courseName: race.sourceTrack,
    courseSlug: null,
    promotionKind: "bet_candidate",
    promotionLabel: race.candidate.detail,
    raceCode: race.code as UserRaceBetInput["raceCode"],
    raceName: race.raceName,
    raceNumber: race.raceNumber,
    rank: race.rank,
    raw: race as unknown as Record<string, unknown>,
    selectedFixedWinPrice: runner?.fixedWinPrice ?? null,
    selectedRunnerName: runner?.name ?? null,
    selectedRunnerNumber: runner?.number ?? null,
    selectedStarterCount: race.starters,
    signalLabel: race.candidate.label,
    source: payload.betBackCandidates?.source ?? "betcha",
    sourceDate: payload.sourceDate,
    sourceRaceCardId: race.raceCardId,
    sourceTimeZone: payload.sourceTimeZone ?? SOURCE_TIME_ZONE,
    sourceTrack: race.sourceTrack,
  };
}

type TrackBetButtonProps = {
  disabledReason: string | null;
  isLogged: boolean;
  onPress: () => void;
};

type SignalGuideProps = {
  modelKey: string;
  modelLabel: string;
};

/**
 * Explains the active model's cash score thresholds without mixing in bonus context.
 */
function SignalGuide({ modelKey, modelLabel }: SignalGuideProps) {
  const explanation = getSignalGuideExplanation(modelKey);

  return (
    <View style={styles.signalGuide}>
      <Text style={styles.signalGuideTitle}>{modelLabel} signals</Text>
      <Text style={styles.signalGuideText}>{explanation}</Text>
      <View style={styles.signalGuidePills}>
        <Text style={[styles.signalGuidePill, styles.signalGuidePositive]}>Positive &gt;= $1.05</Text>
        <Text style={[styles.signalGuidePill, styles.signalGuideNeutral]}>Neutral $0.95-$1.04</Text>
        <Text style={[styles.signalGuidePill, styles.signalGuideWeak]}>Weak &lt; $0.95</Text>
      </View>
      <Text style={styles.signalGuideText}>
        Small sample means fewer than 10 matching historical selections. Limited history means no usable cash average for the active model.
      </Text>
    </View>
  );
}

/**
 * Returns the cash-score formula shown in the candidate signal guide for each model.
 */
function getSignalGuideExplanation(modelKey: string) {
  if (modelKey === "global_bucket_cash_even_blend_v1") {
    return "Score estimates cash returned per $1 using 50% favourite price-bucket cash average and 50% starter-count cash average.";
  }

  if (modelKey === "global_bucket_cash_price_only_v1") {
    return "Score estimates cash returned per $1 using only the matching favourite price-bucket cash average.";
  }

  if (modelKey === "global_bucket_cash_starter_only_v1") {
    return "Score estimates cash returned per $1 using only the matching final-starter-count cash average.";
  }

  if (modelKey === "global_other_starters_average_price_cash_v1") {
    return "Score estimates cash returned per $1 using the matching other-starters average fixed-win price bucket, excluding $70+ outlier prices.";
  }

  if (modelKey === "country_code_bucket_blend_shrunk_v1") {
    return "Score estimates cash returned per $1 using 65% scoped price-bucket cash average and 35% scoped starter-count cash average, shrunk toward global cash buckets.";
  }

  if (modelKey === "country_code_distance_condition_v1") {
    return "Score estimates cash returned per $1 using scoped cash averages: 45% price bucket, 25% starter count, 20% distance band, and 10% track condition.";
  }

  return "Score estimates cash returned per $1 using 65% favourite price-bucket cash average and 35% starter-count cash average.";
}

function TrackBetButton({ disabledReason, isLogged, onPress }: TrackBetButtonProps) {
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
          ? "Betcha tracked"
          : disabledReason
            ? disabledReason
            : "Track Betcha bet"}
      </Text>
    </Pressable>
  );
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

type StateMessageProps = {
  text: string;
};

function StateMessage({ text }: StateMessageProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{text}</Text>
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
  currentLockRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  currentLockText: {
    color: "#667085",
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  finalisationNotice: {
    backgroundColor: "#ecfeff",
    borderColor: "#99f6e4",
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  finalisationNoticeClosed: {
    backgroundColor: "#f8fafc",
    borderColor: "#d0d5dd",
  },
  finalisationText: {
    color: "#475467",
    fontSize: 12,
    lineHeight: 17,
  },
  finalisationTitle: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
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
  disciplineTab: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 6,
    borderWidth: 1,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  disciplineTabActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  disciplineTabText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "900",
  },
  disciplineTabTextActive: {
    color: "#ffffff",
  },
  disciplineTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
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
  lockButton: {
    alignItems: "center",
    backgroundColor: "#18202f",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lockButtonDisabled: {
    opacity: 0.55,
  },
  lockButtonLocked: {
    backgroundColor: "#dcfce7",
  },
  lockButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  lockButtonTextLocked: {
    color: "#166534",
  },
  lockCutoffText: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "right",
  },
  notificationButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notificationButtonEnabled: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  notificationButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  notificationButtonTextEnabled: {
    color: "#166534",
  },
  multiActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  multiContext: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  multiFooter: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  multiHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  multiLeg: {
    alignItems: "flex-start",
    borderTopColor: "#e4e7ec",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
  },
  multiLegIndex: {
    alignItems: "center",
    backgroundColor: "#18202f",
    borderRadius: 6,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  multiLegIndexText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  multiLegList: {
    gap: 8,
    marginTop: 10,
  },
  multiLegMeta: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  multiLegSignal: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  multiLegTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  multiLegTitle: {
    color: "#18202f",
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  multiLegTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  multiMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  multiPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  multiTitle: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
  },
  panel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
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
  raceTitle: {
    color: "#18202f",
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  raceTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
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
  sectionNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  signalGuide: {
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  signalGuideNeutral: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  signalGuidePill: {
    borderRadius: 6,
    borderWidth: 1,
    color: "#18202f",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  signalGuidePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  signalGuidePositive: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
  },
  signalGuideText: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  signalGuideTitle: {
    color: "#18202f",
    fontSize: 12,
    fontWeight: "900",
  },
  signalGuideWeak: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
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
  signalText_caution: {
    color: "#9a3412",
  },
  signalText_muted: {
    color: "#667085",
  },
  signalText_neutral: {
    color: "#3730a3",
  },
  signalText_positive: {
    color: "#067647",
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
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "900",
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
  ufcCardBlock: {
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  ufcSingleCardBlock: {
    borderTopColor: "#e4e7ec",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  ufcSingleCardLegList: {
    gap: 8,
    marginTop: 8,
  },
  ufcSingleCardTitle: {
    color: "#18202f",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
});
