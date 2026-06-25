import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "../config/env";

/**
 * Creates the shared Supabase JS client used for authenticated user features.
 */
export const supabaseClient = publicEnv.supabaseUrl && publicEnv.supabaseKey
  ? createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
        storage: AsyncStorage,
      },
    })
  : null;
