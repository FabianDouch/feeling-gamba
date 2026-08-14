import Constants from "expo-constants";

export type PublicEnv = {
  predictionRefreshUrl?: string;
  promotionRefreshUrl?: string;
  supabaseAnonKey?: string;
  supabaseKey?: string;
  supabasePublishableKey?: string;
  supabaseQuickstartKey?: string;
  supabaseUrl?: string;
  trackOddsRequestUrl?: string;
};

type ExpoPublicExtra = {
  predictionRefreshUrl?: string;
  promotionRefreshUrl?: string;
  supabaseKey?: string;
  supabaseUrl?: string;
  trackOddsRequestUrl?: string;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoPublicExtra;

/**
 * Accepts either the project URL or a copied REST URL and returns the project origin.
 */
function normalizeSupabaseProjectUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

export const publicEnv: PublicEnv = {
  predictionRefreshUrl: process.env.EXPO_PUBLIC_PREDICTION_REFRESH_URL
    ?? expoExtra.predictionRefreshUrl,
  promotionRefreshUrl: process.env.EXPO_PUBLIC_PROMOTION_REFRESH_URL
    ?? expoExtra.promotionRefreshUrl,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    ?? expoExtra.supabaseKey,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY
    ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    ?? expoExtra.supabaseKey,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseQuickstartKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
  supabaseUrl: normalizeSupabaseProjectUrl(process.env.EXPO_PUBLIC_SUPABASE_URL
    ?? expoExtra.supabaseUrl),
  trackOddsRequestUrl: process.env.EXPO_PUBLIC_TRACK_ODDS_REQUEST_URL
    ?? expoExtra.trackOddsRequestUrl,
};

export const hasSupabaseClientConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);
