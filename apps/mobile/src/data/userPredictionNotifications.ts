import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { CurrentPredictionType, PredictionFormat, PredictionSport } from "../screens/PredictionControls";
import { supabaseClient } from "./supabaseClient";

export type FavouritePredictionModelKey = {
  modelKey: string;
  predictionFormat: PredictionFormat;
  predictionSport: PredictionSport;
  predictionType: CurrentPredictionType;
};

export type UserFavouritePredictionModel = FavouritePredictionModelKey & {
  id: string;
  notifyOnFinalised: boolean;
};

type UserFavouritePredictionModelRow = {
  id: string;
  model_key: string;
  notify_on_finalised: boolean;
  prediction_format: PredictionFormat;
  prediction_type: CurrentPredictionType;
  sport: PredictionSport;
};

const FAVOURITE_PREDICTION_MODEL_SELECT = [
  "id",
  "model_key",
  "notify_on_finalised",
  "prediction_format",
  "prediction_type",
  "sport",
].join(",");

/**
 * Configures foreground notification handling for finalised prediction alerts.
 */
export function configurePredictionNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowAlert: true,
    }),
  });
}

/**
 * Requests mobile notification permission and stores this device's Expo push token.
 */
export async function registerPredictionPushToken() {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  if (Platform.OS === "web") {
    throw new Error("Mobile notifications require an iOS or Android build.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to enable notifications.");
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let permissionStatus = existingPermissions.status;

  if (permissionStatus !== "granted") {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    permissionStatus = requestedPermissions.status;
  }

  if (permissionStatus !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const projectId = Constants.easConfig?.projectId
    ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

  if (!projectId) {
    throw new Error("Expo project id is missing from app config.");
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  const { error } = await supabaseClient
    .from("user_push_tokens")
    .upsert({
      enabled: true,
      expo_push_token: token.data,
      last_error: null,
      last_seen_at: new Date().toISOString(),
      platform: Platform.OS,
      user_id: userData.user.id,
    }, {
      onConflict: "expo_push_token",
    });

  if (error) {
    throw new Error(error.message);
  }

  return token.data;
}

/**
 * Reads the signed-in user's model notification favourites.
 */
export async function fetchUserFavouritePredictionModels() {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_favourite_prediction_models")
    .select(FAVOURITE_PREDICTION_MODEL_SELECT)
    .eq("enabled", true)
    .order("sport", { ascending: true })
    .order("prediction_format", { ascending: true })
    .order("prediction_type", { ascending: true })
    .returns<UserFavouritePredictionModelRow[]>();

  if (error) {
    if (isMissingPredictionNotificationTableError(error)) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []).map(mapFavouritePredictionModelRow);
}

/**
 * Saves one selected prediction model as a finalisation notification favourite.
 */
export async function saveUserFavouritePredictionModel(key: FavouritePredictionModelKey) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to enable notifications.");
  }

  const { error } = await supabaseClient
    .from("user_favourite_prediction_models")
    .upsert({
      enabled: true,
      model_key: key.modelKey,
      notify_on_finalised: true,
      prediction_format: key.predictionFormat,
      prediction_type: key.predictionType,
      sport: key.predictionSport,
      user_id: userData.user.id,
    }, {
      onConflict: "user_id,sport,prediction_format,prediction_type,model_key",
    });

  if (error) {
    if (isMissingPredictionNotificationTableError(error)) {
      throw new Error("Prediction notifications are not deployed yet. Apply the latest Supabase migrations and reload the schema cache.");
    }

    throw new Error(error.message);
  }
}

/**
 * Removes one selected prediction model from the signed-in user's notification favourites.
 */
export async function deleteUserFavouritePredictionModel(key: FavouritePredictionModelKey) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { error } = await supabaseClient
    .from("user_favourite_prediction_models")
    .delete()
    .eq("sport", key.predictionSport)
    .eq("prediction_format", key.predictionFormat)
    .eq("prediction_type", key.predictionType)
    .eq("model_key", key.modelKey);

  if (error) {
    if (isMissingPredictionNotificationTableError(error)) {
      return;
    }

    throw new Error(error.message);
  }
}

/**
 * Checks a loaded favourite-model list for one prediction hierarchy key.
 */
export function isFavouritePredictionModel(
  favourites: UserFavouritePredictionModel[],
  key: FavouritePredictionModelKey,
) {
  return favourites.some((favourite) =>
    favourite.predictionSport === key.predictionSport
    && favourite.predictionFormat === key.predictionFormat
    && favourite.predictionType === key.predictionType
    && favourite.modelKey === key.modelKey);
}

function mapFavouritePredictionModelRow(row: UserFavouritePredictionModelRow): UserFavouritePredictionModel {
  return {
    id: row.id,
    modelKey: row.model_key,
    notifyOnFinalised: row.notify_on_finalised,
    predictionFormat: row.prediction_format,
    predictionSport: row.sport,
    predictionType: row.prediction_type,
  };
}

function isMissingPredictionNotificationTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01"
    || String(error.message ?? "").includes("user_favourite_prediction_models")
    || String(error.message ?? "").includes("user_push_tokens");
}
