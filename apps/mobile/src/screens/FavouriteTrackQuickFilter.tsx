import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../data/authSession";
import {
  fetchUserFavouriteTracks,
  isFavouriteTrack,
  type FavouriteTrackInput,
  type UserFavouriteTrack,
} from "../data/userFavouriteTracks";

type FavouriteTrackQuickFilterProps = {
  activeTrack: FavouriteTrackInput | null;
  onSelect: (track: UserFavouriteTrack) => void;
  reloadKey?: number;
};

/**
 * Renders signed-in users' saved tracks as shortcuts for country, discipline, and course filters.
 */
export function FavouriteTrackQuickFilter({
  activeTrack,
  onSelect,
  reloadKey = 0,
}: FavouriteTrackQuickFilterProps) {
  const { user } = useAuth();
  const [favourites, setFavourites] = useState<UserFavouriteTrack[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
  }, [reloadKey, user]);

  if (!user || (!isLoading && favourites.length === 0 && !errorMessage)) {
    return null;
  }

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Favourites</Text>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {isLoading ? (
        <Text style={styles.loadingText}>Loading saved tracks.</Text>
      ) : (
        <View style={styles.row}>
          {favourites.map((favourite) => {
            const isActive = isFavouriteTrack([favourite], activeTrack);

            return (
              <Pressable
                key={favourite.id}
                onPress={() => onSelect(favourite)}
                style={[styles.chip, isActive ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                  {favourite.courseName} · {favourite.raceCode} · {favourite.country}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: "#0f5f58",
    borderColor: "#0f5f58",
  },
  chipText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  errorText: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: 8,
  },
  group: {
    marginBottom: 12,
  },
  label: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  loadingText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
