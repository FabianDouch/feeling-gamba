import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../data/authSession";
import {
  deleteUserFavouriteTrack,
  fetchUserFavouriteTracks,
  type UserFavouriteTrack,
} from "../data/userFavouriteTracks";
import {
  deleteUserRaceBet,
  fetchUserRaceBets,
  formatBookmaker,
  summarizeUserRaceBets,
  type Bookmaker,
  type UserRaceBet,
} from "../data/userRaceBets";
import { BalanceTracker } from "./BalanceTracker";

/**
 * Shows the current Supabase auth state and Google sign-in controls.
 */
export function AccountScreen() {
  const {
    authError,
    isAuthConfigured,
    isLoadingSession,
    isSigningIn,
    signInWithGoogle,
    signOut,
    user,
  } = useAuth();
  const displayName = user?.user_metadata?.full_name
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? "Signed in";
  const [favourites, setFavourites] = useState<UserFavouriteTrack[]>([]);
  const [raceBets, setRaceBets] = useState<UserRaceBet[]>([]);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);
  const [userDataError, setUserDataError] = useState<string | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState<Bookmaker>("betcha");
  const filteredRaceBets = useMemo(
    () => raceBets.filter((bet) => bet.bookmaker === selectedBookmaker),
    [raceBets, selectedBookmaker],
  );
  const betSummary = useMemo(() => summarizeUserRaceBets(filteredRaceBets), [filteredRaceBets]);

  useEffect(() => {
    let isActive = true;

    async function loadUserData() {
      if (!user) {
        setFavourites([]);
        setRaceBets([]);
        return;
      }

      try {
        setIsLoadingUserData(true);
        setUserDataError(null);
        const [nextFavourites, nextRaceBets] = await Promise.all([
          fetchUserFavouriteTracks(),
          fetchUserRaceBets(),
        ]);

        if (isActive) {
          setFavourites(nextFavourites);
          setRaceBets(nextRaceBets);
        }
      } catch (error) {
        if (isActive) {
          setUserDataError(error instanceof Error ? error.message : "Could not load account data.");
        }
      } finally {
        if (isActive) {
          setIsLoadingUserData(false);
        }
      }
    }

    loadUserData();

    return () => {
      isActive = false;
    };
  }, [user]);

  /**
   * Removes a saved track and refreshes the owner-scoped favourite list.
   */
  async function removeFavourite(track: UserFavouriteTrack) {
    try {
      setUserDataError(null);
      await deleteUserFavouriteTrack(track);
      setFavourites(await fetchUserFavouriteTracks());
    } catch (error) {
      setUserDataError(error instanceof Error ? error.message : "Could not remove favourite track.");
    }
  }

  /**
   * Removes a manually logged promo bet and refreshes personal statistics.
   */
  async function removeRaceBet(id: string) {
    try {
      setUserDataError(null);
      await deleteUserRaceBet(id);
      setRaceBets(await fetchUserRaceBets());
    } catch (error) {
      setUserDataError(error instanceof Error ? error.message : "Could not remove logged bet.");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.heading}>Account</Text>
        <Text style={styles.statusText}>
          {isLoadingSession
            ? "Checking session"
            : user
              ? displayName
              : "Signed out"}
        </Text>
        {user?.email ? (
          <Text style={styles.emailText}>{user.email}</Text>
        ) : null}

        {!isAuthConfigured ? (
          <View style={[styles.messageBox, styles.warningBox]}>
            <Text style={styles.warningText}>Supabase auth is not configured.</Text>
          </View>
        ) : authError ? (
          <View style={[styles.messageBox, styles.errorBox]}>
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={!isAuthConfigured || isLoadingSession || isSigningIn}
          onPress={user ? signOut : signInWithGoogle}
          style={[
            styles.primaryButton,
            (!isAuthConfigured || isLoadingSession || isSigningIn) ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSigningIn
              ? "Opening Google"
              : user
                ? "Sign out"
                : "Sign in with Google"}
          </Text>
        </Pressable>
      </View>

      {user ? (
        <>
          <BalanceTracker />

          <View style={styles.panel}>
            <Text style={styles.sectionHeading}>Favourite tracks</Text>
            {isLoadingUserData ? (
              <Text style={styles.helperText}>Loading account data.</Text>
            ) : favourites.length ? favourites.map((track) => (
              <View key={track.id} style={styles.listRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{track.courseName}</Text>
                  <Text style={styles.rowMeta}>{track.raceCode} · {track.country}</Text>
                </View>
                <Pressable onPress={() => removeFavourite(track)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            )) : (
              <Text style={styles.helperText}>No favourite tracks saved yet.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionHeading}>Tracked promo bets</Text>
            <BookmakerToggle
              selectedBookmaker={selectedBookmaker}
              onChange={setSelectedBookmaker}
            />
            <Text style={styles.helperText}>
              {formatBookmaker(selectedBookmaker)} · {betSummary.totalCount} logged · {betSummary.settledCount} settled ·{" "}
              {betSummary.pendingCount} pending · {betSummary.missingCount} missing
            </Text>

            {betSummary.disciplineStats.length ? (
              <View style={styles.statsGrid}>
                {betSummary.disciplineStats.map((stat) => (
                  <View key={stat.discipline} style={styles.statCard}>
                    <Text style={styles.statTitle}>{stat.discipline}</Text>
                    <Text style={styles.statValue}>{stat.roi}</Text>
                    <Text style={styles.statMeta}>Cash+bonus ROI</Text>
                    <Text style={styles.statMeta}>Cash avg {stat.averageReturn}</Text>
                    <Text style={styles.statMeta}>Cash net {stat.cashNet}</Text>
                    <Text style={styles.statMeta}>Cash+bonus avg {stat.cashPlusBonusAverage}</Text>
                    <Text style={styles.statMeta}>Cash+bonus net {stat.cashPlusBonusNet}</Text>
                    <Text style={styles.statDetail}>{stat.detail}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>
                Settled statistics will appear after logged races have results.
              </Text>
            )}

            {filteredRaceBets.length ? filteredRaceBets.slice(0, 20).map((bet) => (
              <View key={bet.id} style={styles.listRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{bet.runnerLabel}</Text>
                  <Text style={styles.rowMeta}>{bet.raceLabel}</Text>
                  <Text style={styles.rowMeta}>
                    {bet.outcomeStatus} · recorded {formatAccountDate(bet.recordedAt)}
                  </Text>
                </View>
                <Pressable onPress={() => removeRaceBet(bet.id)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            )) : null}
          </View>

          {userDataError ? (
            <View style={[styles.messageBox, styles.errorBox]}>
              <Text style={styles.errorText}>{userDataError}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

type BookmakerToggleProps = {
  onChange: (bookmaker: Bookmaker) => void;
  selectedBookmaker: Bookmaker;
};

/**
 * Selects the bookmaker scope used for personal tracked-bet history and stats.
 */
function BookmakerToggle({ onChange, selectedBookmaker }: BookmakerToggleProps) {
  const options: Bookmaker[] = ["betcha", "tab"];

  return (
    <View style={styles.toggleRow}>
      {options.map((bookmaker) => {
        const isActive = bookmaker === selectedBookmaker;

        return (
          <Pressable
            key={bookmaker}
            onPress={() => onChange(bookmaker)}
            style={[styles.toggleButton, isActive ? styles.toggleButtonActive : null]}
          >
            <Text style={[styles.toggleButtonText, isActive ? styles.toggleButtonTextActive : null]}>
              {formatBookmaker(bookmaker)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatAccountDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.55,
  },
  emailText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#fef3f2",
    borderColor: "#fecdca",
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  heading: {
    color: "#101828",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  messageBox: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#175cd3",
    borderRadius: 6,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  screen: {
    gap: 12,
  },
  helperText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  listRow: {
    alignItems: "center",
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
  },
  removeButton: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  removeButtonText: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "900",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  rowTitle: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  sectionHeading: {
    color: "#18202f",
    fontSize: 16,
    fontWeight: "900",
  },
  statusText: {
    color: "#344054",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 8,
  },
  statCard: {
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 190,
    padding: 12,
  },
  statDetail: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  statMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  statTitle: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "900",
  },
  statValue: {
    color: "#0f5f58",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6,
  },
  toggleButton: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toggleButtonActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  toggleButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  toggleButtonTextActive: {
    color: "#ffffff",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  warningBox: {
    backgroundColor: "#fffaeb",
    borderColor: "#fedf89",
  },
  warningText: {
    color: "#b54708",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
});
