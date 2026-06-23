import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../data/authSession";
import {
  deleteUserFavouriteTrack,
  fetchUserFavouriteTracks,
  isFavouriteTrack,
  saveUserFavouriteTrack,
  type FavouriteTrackInput,
  type UserFavouriteTrack,
} from "../data/userFavouriteTracks";

type FavouriteTrackControlProps = {
  onChange?: () => void;
  track: FavouriteTrackInput | null;
};

/**
 * Lets a signed-in user save or remove one concrete country/discipline/track scope.
 */
export function FavouriteTrackControl({ onChange, track }: FavouriteTrackControlProps) {
  const { user } = useAuth();
  const [favourites, setFavourites] = useState<UserFavouriteTrack[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSaved = isFavouriteTrack(favourites, track);

  useEffect(() => {
    let isActive = true;

    async function loadFavourites() {
      if (!user) {
        setFavourites([]);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const nextFavourites = await fetchUserFavouriteTracks();

        if (isActive) {
          setFavourites(nextFavourites);
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load favourite tracks.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadFavourites();

    return () => {
      isActive = false;
    };
  }, [user]);

  if (!track) {
    return null;
  }

  /**
   * Toggles the selected track and refreshes the local favourite list after the write.
   */
  async function toggleFavourite() {
    if (!track || !user || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      if (isSaved) {
        await deleteUserFavouriteTrack(track);
      } else {
        await saveUserFavouriteTrack(track);
      }

      setFavourites(await fetchUserFavouriteTracks());
      onChange?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update favourite track.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.copy}>
        <Text style={styles.title}>
          {track.courseName} · {track.raceCode} · {track.country}
        </Text>
        <Text style={styles.note}>
          {user
            ? isSaved
              ? "Saved to your favourite tracks."
              : "Save this track for quicker filtering later."
            : "Sign in to save favourite tracks."}
        </Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
      <Pressable
        disabled={!user || isLoading || isSaving}
        onPress={toggleFavourite}
        style={[
          styles.button,
          isSaved ? styles.buttonSaved : null,
          (!user || isLoading || isSaving) ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={[styles.buttonText, isSaved ? styles.buttonTextSaved : null]}>
          {isSaving
            ? "Saving"
            : isSaved
              ? "Saved"
              : "Save"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#175cd3",
    borderColor: "#175cd3",
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonDisabled: {
    opacity: 0.52,
  },
  buttonSaved: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  buttonTextSaved: {
    color: "#067647",
  },
  copy: {
    flex: 1,
  },
  errorText: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
  },
  note: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 3,
  },
  panel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    padding: 12,
  },
  title: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
});
