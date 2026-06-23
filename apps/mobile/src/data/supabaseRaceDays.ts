import { publicEnv } from "../config/env";
import type { RaceCode, RaceFilterOption, RaceSummary } from "./collectedRaceDay";

const SUPABASE_PAGE_SIZE = 1000;
const DEFAULT_DATE_WINDOW_SIZE = 14;
export const DEFAULT_RACE_DAY_ROW_LIMIT = 20;

export type RaceDayFilters = {
  country: string;
  course: string;
  discipline: string;
  fromDate: string;
  toDate: string;
};

export type RaceDayMetadata = {
  countryOptions: RaceFilterOption[];
  dateOptions: RaceFilterOption[];
  defaultDateRange: {
    from: string;
    to: string;
  };
  disciplineOptions: RaceFilterOption[];
  latestWindowLabel: string;
  latestWindowRangeLabel: string;
  courseOptionsByCountry: Map<string, RaceFilterOption[]>;
};

export type RaceDayQueryResult = {
  races: RaceSummary[];
  totalCount: number;
};

type RaceDayQueryOptions = {
  limit?: number;
};

type RaceDayEntryRow = {
  country: string;
  course_name: string;
  course_slug: string;
  favourite_bonus_credit: number | null;
  favourite_price: number | null;
  favourite_result_position: number | null;
  favourite_runner_name: string | null;
  favourite_total_value_with_bonus_credit: number | null;
  favourite_win_return: number | null;
  meeting_date: string;
  race_code: RaceCode;
  race_id: string;
  race_name: string | null;
  race_number: number;
  source_status: string | null;
  starter_count: number | null;
  status: string | null;
  winner_runner_name: string | null;
  winner_win_dividend: number | null;
};

type MetadataRow = {
  country: string | null;
  course_name: string | null;
  course_slug: string | null;
  race_code: RaceCode | null;
};

export const hasSupabaseRaceDayConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads Race Days metadata used to build filter controls without loading all race rows.
 */
export async function fetchRaceDayMetadata(): Promise<RaceDayMetadata> {
  const dateRows = await supabaseSelectAll<{ meeting_date: string }>("race_day_entries", {
    order: "meeting_date.desc",
    select: "meeting_date",
  });
  const metadataRows = await supabaseSelectAll<MetadataRow>("race_day_entries", {
    order: "country.asc,course_name.asc,race_code.asc",
    select: "country,course_name,course_slug,race_code",
  });
  const dates = unique(dateRows.map((row) => row.meeting_date)).sort();
  const latestDates = dates.slice(-DEFAULT_DATE_WINDOW_SIZE);
  const from = latestDates[0] ?? dates[0] ?? "";
  const to = latestDates.at(-1) ?? from;
  const countryOptions = unique(metadataRows
    .map((row) => row.country)
    .filter((country): country is string => Boolean(country)))
    .sort()
    .map((country) => ({ label: country, value: country }));
  const disciplineOptions = [
    { label: "Horse", value: "horse" },
    { label: "Harness", value: "harness" },
    { label: "Greyhound", value: "greyhound" },
  ].filter((option) => metadataRows.some((row) => row.race_code === option.value));
  const courseOptionsByCountry = buildCourseOptionsByCountry(metadataRows);

  return {
    countryOptions,
    courseOptionsByCountry,
    dateOptions: dates.map((date) => ({
      label: formatLongDateLabel(date),
      value: date,
    })),
    defaultDateRange: {
      from,
      to,
    },
    disciplineOptions,
    latestWindowLabel: dates.length
      ? `${formatLongDateLabel(dates[0])} - ${formatLongDateLabel(dates.at(-1) ?? dates[0])}`
      : "No race dates",
    latestWindowRangeLabel: from
      ? `Default shows latest ${DEFAULT_RACE_DAY_ROW_LIMIT} races. Date reset covers latest ${latestDates.length} race dates: ${formatLongDateLabel(from)} - ${formatLongDateLabel(to)}`
      : "No race dates loaded from Supabase.",
  };
}

/**
 * Fetches Race Days rows from Supabase using the selected server-side filters.
 */
export async function fetchRaceDayEntries(
  filters: RaceDayFilters,
  options: RaceDayQueryOptions = {},
): Promise<RaceDayQueryResult> {
  const params: Record<string, string> = {
    order: options.limit
      ? "meeting_date.desc,advertised_start.desc,race_number.desc"
      : "meeting_date.desc,advertised_start.asc,race_number.asc",
    select: [
      "race_id",
      "meeting_date",
      "country",
      "race_code",
      "course_name",
      "course_slug",
      "race_number",
      "race_name",
      "status",
      "starter_count",
      "favourite_runner_name",
      "favourite_price",
      "favourite_result_position",
      "favourite_win_return",
      "favourite_bonus_credit",
      "favourite_total_value_with_bonus_credit",
      "winner_runner_name",
      "winner_win_dividend",
      "source_status",
    ].join(","),
  };

  if (filters.fromDate) {
    params.meeting_date = `gte.${filters.fromDate}`;
  }

  if (filters.toDate) {
    params.and = `(meeting_date.gte.${filters.fromDate},meeting_date.lte.${filters.toDate})`;
    delete params.meeting_date;
  }

  if (filters.country !== "all") {
    params.country = `eq.${filters.country}`;
  }

  if (filters.discipline !== "all") {
    params.race_code = `eq.${filters.discipline}`;
  }

  if (filters.course !== "all") {
    params.course_slug = `eq.${filters.course}`;
  }

  const { count, rows } = options.limit
    ? await supabaseSelectLimitedWithCount<RaceDayEntryRow>("race_day_entries", params, options.limit)
    : await supabaseSelectAllWithCount<RaceDayEntryRow>("race_day_entries", params);

  return {
    races: rows.map(mapRaceDayEntryToSummary),
    totalCount: count ?? rows.length,
  };
}

/**
 * Returns course filter options scoped to the selected country.
 */
export function getCourseOptions(metadata: RaceDayMetadata | null, country: string) {
  if (!metadata) {
    return [];
  }

  return metadata.courseOptionsByCountry.get(country) ?? [];
}

/**
 * Creates the initial all-country Race Days filters from Supabase metadata.
 */
export function createDefaultRaceDayFilters(metadata: RaceDayMetadata): RaceDayFilters {
  return {
    country: "all",
    course: "all",
    discipline: "all",
    fromDate: metadata.defaultDateRange.from,
    toDate: metadata.defaultDateRange.to,
  };
}

/**
 * Reads a capped Supabase result while still asking PostgREST for the matching row count.
 */
async function supabaseSelectLimitedWithCount<TRow>(
  table: string,
  params: Record<string, string | number>,
  limit: number,
) {
  return supabaseSelectPage<TRow>(table, {
    ...params,
    limit,
    offset: 0,
  });
}

/**
 * Reads all matching Supabase REST rows across paginated responses.
 */
async function supabaseSelectAll<TRow>(table: string, params: Record<string, string | number>) {
  const { rows } = await supabaseSelectAllWithCount<TRow>(table, params);
  return rows;
}

/**
 * Reads all matching Supabase REST rows and returns the exact count header when available.
 */
async function supabaseSelectAllWithCount<TRow>(
  table: string,
  params: Record<string, string | number>,
) {
  const rows: TRow[] = [];
  let count: number | null = null;
  let offset = 0;

  do {
    const page = await supabaseSelectPage<TRow>(table, {
      ...params,
      limit: SUPABASE_PAGE_SIZE,
      offset,
    });
    rows.push(...page.rows);
    count = page.count ?? count;

    if (page.rows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    offset += SUPABASE_PAGE_SIZE;
  } while (count === null || rows.length < count);

  return {
    count,
    rows,
  };
}

/**
 * Reads one Supabase REST page with count metadata.
 */
async function supabaseSelectPage<TRow>(table: string, params: Record<string, string | number>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/${table}`, publicEnv.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
      prefer: "count=exact",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} read failed with HTTP ${response.status}`);
  }

  return {
    count: parseContentRangeCount(response.headers.get("content-range")),
    rows: await response.json() as TRow[],
  };
}

function parseContentRangeCount(value: string | null) {
  const match = value?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function unique<TValue>(values: TValue[]) {
  return Array.from(new Set(values));
}

/**
 * Builds all-country and country-scoped course options from metadata rows.
 */
function buildCourseOptionsByCountry(rows: MetadataRow[]) {
  const byCountry = new Map<string, Map<string, RaceFilterOption>>();

  for (const row of rows) {
    if (!row.course_slug || !row.course_name) {
      continue;
    }

    const countries = ["all"];

    if (row.country) {
      countries.push(row.country);
    }

    for (const country of countries) {
      const courses = byCountry.get(country) ?? new Map<string, RaceFilterOption>();
      courses.set(row.course_slug, {
        label: row.course_name,
        value: row.course_slug,
      });
      byCountry.set(country, courses);
    }
  }

  return new Map(Array.from(byCountry.entries()).map(([country, courses]) => [
    country,
    Array.from(courses.values()).sort((left, right) => left.label.localeCompare(right.label)),
  ]));
}

/**
 * Converts one Supabase read-model row into the Race Days list row shape.
 */
function mapRaceDayEntryToSummary(row: RaceDayEntryRow): RaceSummary {
  const favouriteReturn = row.favourite_win_return ?? 0;
  const favouriteBonusCredit = row.favourite_bonus_credit ?? 0;

  return {
    code: row.race_code,
    country: row.country,
    dateLabel: formatDateLabel(row.meeting_date),
    dateValue: row.meeting_date,
    favourite: row.favourite_runner_name ?? "Missing favourite",
    favouriteFinish: ordinal(row.favourite_result_position),
    number: row.race_number,
    payout: favouriteBonusCredit > 0
      ? `Fav ${formatReturn(favouriteReturn)} + ${formatReturn(favouriteBonusCredit)} bonus`
      : `Fav return ${formatReturn(favouriteReturn)}`,
    raceId: row.race_id,
    raceName: row.race_name ?? "Unnamed race",
    result: describeFavouriteResult(row.favourite_result_position),
    starters: row.starter_count ?? 0,
    status: row.status === "FINAL"
      ? "Final"
      : row.source_status === "missing_result"
        ? "Pending"
        : "Missing market",
    track: row.course_name,
  };
}

/**
 * Turns an ISO date string into the compact date label used in race rows.
 */
function formatDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

/**
 * Turns an ISO date string into the full date label used by filters and range text.
 */
function formatLongDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}

function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

/**
 * Converts a finishing position into a readable ordinal, or "Missing" when unknown.
 */
function ordinal(value: number | null) {
  if (value === null) {
    return "Missing";
  }

  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  return `${value}${suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0]}`;
}

/**
 * Summarises the favourite's finish in plain language for the race list.
 */
function describeFavouriteResult(resultPosition: number | null) {
  if (resultPosition === null) {
    return "Favourite result missing";
  }

  if (resultPosition === 1) {
    return "Favourite won";
  }

  if (resultPosition <= 3) {
    return `Favourite ${ordinal(resultPosition)}`;
  }

  return "Favourite unplaced";
}
