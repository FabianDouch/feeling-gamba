import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabaseClient } from "./supabaseClient";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  authError: string | null;
  isAuthConfigured: boolean;
  isLoadingSession: boolean;
  isSigningIn: boolean;
  session: Session | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getOAuthCallbackParam(url: string, key: string) {
  const parsed = new URL(url);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));

  return parsed.searchParams.get(key) ?? hashParams.get(key);
}

/**
 * Holds Supabase session state and opens Google OAuth through the system browser.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const isAuthConfigured = Boolean(supabaseClient);

  useEffect(() => {
    if (!supabaseClient) {
      setIsLoadingSession(false);
      return undefined;
    }

    let isActive = true;

    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!isActive) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      }

      setSession(data.session);
      setIsLoadingSession(false);
    });

    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isActive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /**
   * Starts Google OAuth and exchanges the returned PKCE code for a Supabase session.
   */
  async function signInWithGoogle() {
    if (!supabaseClient) {
      setAuthError("Supabase auth is not configured.");
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);

    try {
      const redirectTo = AuthSession.makeRedirectUri({
        path: "auth/callback",
        scheme: "feelinggamba",
      });
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
        provider: "google",
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error("Google sign-in did not return an auth URL.");
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== "success") {
        return;
      }

      const oauthError = getOAuthCallbackParam(result.url, "error_description")
        ?? getOAuthCallbackParam(result.url, "error");

      if (oauthError) {
        throw new Error(oauthError);
      }

      const code = getOAuthCallbackParam(result.url, "code");

      if (!code) {
        throw new Error("Google sign-in completed without an auth code.");
      }

      const { error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        throw exchangeError;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setIsSigningIn(false);
    }
  }

  /**
   * Clears the current Supabase session from the device.
   */
  async function signOut() {
    if (!supabaseClient) {
      setAuthError("Supabase auth is not configured.");
      return;
    }

    setAuthError(null);
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      setAuthError(error.message);
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    authError,
    isAuthConfigured,
    isLoadingSession,
    isSigningIn,
    session,
    signInWithGoogle,
    signOut,
    user: session?.user ?? null,
  }), [authError, isAuthConfigured, isLoadingSession, isSigningIn, session]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Reads the current authenticated Supabase user state.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
