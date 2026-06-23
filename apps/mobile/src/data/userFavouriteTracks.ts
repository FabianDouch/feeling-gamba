import type { RaceCode } from "./collectedRaceDay";
import { supabaseClient } from "./supabaseClient";

export type UserFavouriteTrack = {
  country: string;
  courseName: string;
  courseSlug: string;
  id: string;
  raceCode: RaceCode;
};

export type FavouriteTrackInput = {
  country: string;
  courseName: string;
  courseSlug: string;
  raceCode: RaceCode;
};

type UserFavouriteTrackRow = {
  country: string;
  course_name: string;
  course_slug: string;
  id: string;
  race_code: RaceCode;
};

/**
 * Reads the signed-in user's saved tracks through Supabase RLS.
 */
export async function fetchUserFavouriteTracks() {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_favourite_tracks")
    .select("id,country,race_code,course_slug,course_name")
    .order("country", { ascending: true })
    .order("course_name", { ascending: true })
    .returns<UserFavouriteTrackRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapFavouriteTrackRow);
}

/**
 * Saves one concrete country, discipline, and track for the signed-in user.
 */
export async function saveUserFavouriteTrack(track: FavouriteTrackInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to save favourite tracks.");
  }

  const { error } = await supabaseClient
    .from("user_favourite_tracks")
    .upsert({
      country: track.country,
      course_name: track.courseName,
      course_slug: track.courseSlug,
      race_code: track.raceCode,
      user_id: userData.user.id,
    }, {
      onConflict: "user_id,country,race_code,course_slug",
    });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Removes one saved track for the signed-in user.
 */
export async function deleteUserFavouriteTrack(track: FavouriteTrackInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { error } = await supabaseClient
    .from("user_favourite_tracks")
    .delete()
    .eq("country", track.country)
    .eq("race_code", track.raceCode)
    .eq("course_slug", track.courseSlug);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Checks a loaded favourite list for one concrete track key.
 */
export function isFavouriteTrack(
  favourites: UserFavouriteTrack[],
  track: FavouriteTrackInput | null,
) {
  if (!track) {
    return false;
  }

  return favourites.some((favourite) =>
    favourite.country === track.country
    && favourite.raceCode === track.raceCode
    && favourite.courseSlug === track.courseSlug);
}

function mapFavouriteTrackRow(row: UserFavouriteTrackRow): UserFavouriteTrack {
  return {
    country: row.country,
    courseName: row.course_name,
    courseSlug: row.course_slug,
    id: row.id,
    raceCode: row.race_code,
  };
}
