const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");

const APP_DISPLAY_NAME = "Feeling Gamba";
const APP_SCHEME = "feelinggamba";
const APP_SLUG = "feeling-gamba";
const EAS_PROJECT_ID = "c5cf0669-d55e-42ab-9361-d7d9fb6b9531";
const IOS_BUNDLE_IDENTIFIER = "com.fabiandouch.feelinggamba";
const IOS_BUILD_NUMBER = "2";

const PUBLIC_ENV_KEYS = [
  "EXPO_PUBLIC_PREDICTION_REFRESH_URL",
  "EXPO_PUBLIC_PROMOTION_REFRESH_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_KEY",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_TRACK_ODDS_REQUEST_URL",
];

/**
 * Loads repo-root public Expo env values when the mobile workspace is the Expo project root.
 */
function loadRootPublicEnv() {
  const envPath = path.resolve(__dirname, "../..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

    if (!match || !PUBLIC_ENV_KEYS.includes(match[1]) || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

loadRootPublicEnv();

module.exports = {
  ...appJson.expo,
  name: APP_DISPLAY_NAME,
  scheme: APP_SCHEME,
  slug: APP_SLUG,
  ios: {
    ...appJson.expo.ios,
    buildNumber: IOS_BUILD_NUMBER,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    infoPlist: {
      ...appJson.expo.ios?.infoPlist,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  extra: {
    ...appJson.expo.extra,
    eas: {
      ...appJson.expo.extra?.eas,
      projectId: EAS_PROJECT_ID,
    },
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY
      ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    promotionRefreshUrl: process.env.EXPO_PUBLIC_PROMOTION_REFRESH_URL,
    predictionRefreshUrl: process.env.EXPO_PUBLIC_PREDICTION_REFRESH_URL,
    trackOddsRequestUrl: process.env.EXPO_PUBLIC_TRACK_ODDS_REQUEST_URL,
  },
};
