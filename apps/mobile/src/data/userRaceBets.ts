import { supabaseClient } from "./supabaseClient";

type RaceCode = "greyhound" | "harness" | "horse";
type OutcomeStatus = "missing_result" | "missing_runner" | "pending" | "race_not_found" | "settled";
export type Bookmaker = "betcha" | "tab";

export type UserRaceBetInput = {
  advertisedStart: string | null;
  bookmaker: Bookmaker;
  country: string | null;
  courseName: string | null;
  courseSlug: string | null;
  promotionKind: string;
  promotionLabel: string | null;
  raceCode: RaceCode;
  raceName: string | null;
  raceNumber: number | null;
  rank: number | null;
  raw: Record<string, unknown>;
  selectedFixedWinPrice: number | null;
  selectedRunnerName: string | null;
  selectedRunnerNumber: number | null;
  selectedStarterCount: number | null;
  signalLabel: string | null;
  source: string;
  sourceDate: string | null;
  sourceRaceCardId: string;
  sourceTimeZone: string;
  sourceTrack: string | null;
};

export type UserRaceBet = {
  advertisedStart: string | null;
  bookmaker: Bookmaker;
  cashReturn: number | null;
  country: string;
  courseName: string;
  id: string;
  outcomePosition: number | null;
  outcomeStatus: OutcomeStatus;
  raceCode: RaceCode;
  raceLabel: string;
  recordedAt: string;
  runnerLabel: string;
  sourceRaceCardId: string;
  totalValue: number | null;
};

export type UserRaceBetDisciplineStat = {
  averageReturn: string;
  bonusAverageReturn: string;
  cashNet: string;
  cashPlusBonusAverage: string;
  cashPlusBonusNet: string;
  detail: string;
  discipline: string;
  roi: string;
  settledCount: number;
};

export type UserRaceBetSummary = {
  disciplineStats: UserRaceBetDisciplineStat[];
  missingCount: number;
  pendingCount: number;
  settledCount: number;
  totalCount: number;
};

type UserRaceBetRow = {
  advertised_start: string | null;
  bookmaker: Bookmaker;
  country: string | null;
  course_name: string | null;
  id: string;
  outcome_bonus_credit: number | string | null;
  outcome_result_position: number | null;
  outcome_status: OutcomeStatus;
  outcome_total_value_with_bonus_credit: number | string | null;
  outcome_win_return: number | string | null;
  race_code: RaceCode;
  race_name: string | null;
  race_number: number | null;
  recorded_at: string;
  selected_fixed_win_price: number | string | null;
  selected_runner_name: string | null;
  selected_runner_number: number | null;
  source_race_card_id: string;
  source_track: string | null;
};

const USER_RACE_BET_SELECT = [
  "advertised_start",
  "bookmaker",
  "country",
  "course_name",
  "id",
  "outcome_bonus_credit",
  "outcome_result_position",
  "outcome_status",
  "outcome_total_value_with_bonus_credit",
  "outcome_win_return",
  "race_code",
  "race_name",
  "race_number",
  "recorded_at",
  "selected_fixed_win_price",
  "selected_runner_name",
  "selected_runner_number",
  "source_race_card_id",
  "source_track",
].join(",");

/**
 * Reads the signed-in user's manually logged promo bets through Supabase RLS.
 */
export async function fetchUserRaceBets() {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data, error } = await supabaseClient
    .from("user_race_bets")
    .select(USER_RACE_BET_SELECT)
    .order("recorded_at", { ascending: false })
    .limit(100)
    .returns<UserRaceBetRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapUserRaceBetRow);
}

/**
 * Stores one manually flagged promo bet for the signed-in user without creating duplicates.
 */
export async function saveUserRaceBet(input: UserRaceBetInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Sign in to track promo bets.");
  }

  const { error } = await supabaseClient
    .from("user_race_bets")
    .upsert({
      advertised_start: input.advertisedStart,
      bookmaker: input.bookmaker,
      country: input.country,
      course_name: input.courseName,
      course_slug: input.courseSlug,
      promotion_kind: input.promotionKind,
      promotion_label: input.promotionLabel,
      race_code: input.raceCode,
      race_name: input.raceName,
      race_number: input.raceNumber,
      rank: input.rank,
      raw: input.raw,
      recorded_at: new Date().toISOString(),
      selected_fixed_win_price: input.selectedFixedWinPrice,
      selected_runner_name: input.selectedRunnerName,
      selected_runner_number: input.selectedRunnerNumber,
      selected_starter_count: input.selectedStarterCount,
      signal_label: input.signalLabel,
      source: input.source,
      source_date: input.sourceDate,
      source_race_card_id: input.sourceRaceCardId,
      source_time_zone: input.sourceTimeZone,
      source_track: input.sourceTrack,
      user_id: userData.user.id,
    }, {
      onConflict: "user_id,bookmaker,source,source_race_card_id",
    });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Removes one logged promo bet owned by the signed-in user.
 */
export async function deleteUserRaceBet(id: string) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { error } = await supabaseClient
    .from("user_race_bets")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Checks whether the current race card has already been manually logged.
 */
export function isUserRaceBetLogged(
  bets: UserRaceBet[],
  sourceRaceCardId: string,
  bookmaker: Bookmaker,
) {
  return bets.some((bet) =>
    bet.bookmaker === bookmaker
    && bet.sourceRaceCardId === sourceRaceCardId);
}

/**
 * Builds personal promo-bet performance stats from settled rows only.
 */
export function summarizeUserRaceBets(bets: UserRaceBet[]): UserRaceBetSummary {
  const buckets = new Map<RaceCode, {
    bonus: number;
    count: number;
    cash: number;
    total: number;
  }>();
  let missingCount = 0;
  let pendingCount = 0;
  let settledCount = 0;

  for (const bet of bets) {
    if (bet.outcomeStatus === "pending") {
      pendingCount += 1;
      continue;
    }

    if (bet.outcomeStatus !== "settled") {
      missingCount += 1;
      continue;
    }

    const bucket = buckets.get(bet.raceCode) ?? {
      bonus: 0,
      cash: 0,
      count: 0,
      total: 0,
    };
    const cashReturn = bet.cashReturn ?? 0;
    const totalValue = bet.totalValue ?? cashReturn;

    bucket.count += 1;
    bucket.cash += cashReturn;
    bucket.total += totalValue;
    bucket.bonus += Math.max(0, totalValue - cashReturn);
    buckets.set(bet.raceCode, bucket);
    settledCount += 1;
  }

  return {
    disciplineStats: Array.from(buckets.entries()).map(([discipline, bucket]) => {
      const cashNet = bucket.cash - bucket.count;
      const totalNet = bucket.total - bucket.count;

      return {
        averageReturn: formatCurrency(bucket.cash / bucket.count),
        bonusAverageReturn: formatCurrency(bucket.bonus / bucket.count),
        cashNet: formatCurrency(cashNet),
        cashPlusBonusAverage: formatCurrency(bucket.total / bucket.count),
        cashPlusBonusNet: formatCurrency(totalNet),
        detail: `${bucket.count} settled logged bets · cash ROI ${formatPercentage(cashNet / bucket.count * 100)}`,
        discipline: formatRaceCode(discipline),
        roi: formatPercentage(totalNet / bucket.count * 100),
        settledCount: bucket.count,
      };
    }),
    missingCount,
    pendingCount,
    settledCount,
    totalCount: bets.length,
  };
}

function mapUserRaceBetRow(row: UserRaceBetRow): UserRaceBet {
  const track = row.course_name ?? row.source_track ?? "Unknown track";
  const raceNumber = row.race_number ? `R${row.race_number}` : "Race";
  const runnerNumber = row.selected_runner_number ? `#${row.selected_runner_number} ` : "";

  return {
    advertisedStart: row.advertised_start,
    bookmaker: row.bookmaker,
    cashReturn: numeric(row.outcome_win_return),
    country: row.country ?? "-",
    courseName: track,
    id: row.id,
    outcomePosition: row.outcome_result_position,
    outcomeStatus: row.outcome_status,
    raceCode: row.race_code,
    raceLabel: `${track} · ${raceNumber}${row.race_name ? ` · ${row.race_name}` : ""}`,
    recordedAt: row.recorded_at,
    runnerLabel: `${runnerNumber}${row.selected_runner_name ?? "Selected runner"}`,
    sourceRaceCardId: row.source_race_card_id,
    totalValue: numeric(row.outcome_total_value_with_bonus_credit),
  };
}

export function formatBookmaker(value: Bookmaker) {
  return value === "tab" ? "TAB" : "Betcha";
}

function numeric(value: number | string | null) {
  if (value === null) {
    return null;
  }

  return Number(value);
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatRaceCode(value: RaceCode) {
  return value === "horse"
    ? "Horse"
    : value === "harness"
      ? "Harness"
      : "Greyhound";
}
