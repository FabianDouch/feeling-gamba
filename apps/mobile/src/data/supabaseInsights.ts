import { publicEnv } from "../config/env";
import type {
  DisciplineReturn,
  FavouriteStat,
  InsightsData,
  OtherStartersAveragePriceBreakdown,
  PriceBreakdown,
  RaceFilterOption,
  StarterBreakdown,
} from "./collectedRaceDay";

type NullableNumber = number | string | null;

type InsightAggregateRow = {
  average_return_per_dollar: NullableNumber;
  average_value_per_dollar_with_bonus_credit: NullableNumber;
  bonus_credit_percentage: NullableNumber;
  country: string | null;
  course_name: string | null;
  course_slug: string | null;
  favourite_selections: number;
  missing_price_count: number;
  net_return: NullableNumber;
  other_starters_average_price_bucket_label: string | null;
  other_starters_average_price_bucket_start: NullableNumber;
  price_bucket_label: string | null;
  price_bucket_start: NullableNumber;
  race_code: string | null;
  roi_percentage: NullableNumber;
  scope_key: string;
  scope_type: InsightScopeType;
  second_percentage: NullableNumber;
  seconds: number;
  starter_count: number | null;
  third_percentage: NullableNumber;
  thirds: number;
  total_bonus_credit: NullableNumber;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  total_value_with_bonus_credit: NullableNumber;
  win_percentage: NullableNumber;
  wins: number;
};

type InsightMetadataRow = {
  country: string | null;
  course_name: string | null;
  course_slug: string | null;
  race_code: string | null;
  scope_type: InsightScopeType;
};

type InsightScopeType =
  | "overall"
  | "country"
  | "course"
  | "race_code"
  | "country_race_code"
  | "course_race_code"
  | "starter_count"
  | "price_bucket"
  | "other_starters_average_price_bucket";

type InsightScope = {
  country: string;
  course: string;
  kind: "overall" | "country" | "course" | "race_code" | "country_race_code" | "course_race_code";
  raceCode: string;
};

export type InsightMetadata = {
  countryOptions: RaceFilterOption[];
  courseOptionsByCountry: Map<string, RaceFilterOption[]>;
  disciplineOptions: RaceFilterOption[];
};

export type InsightFilters = {
  country: string;
  course: string;
  discipline: string;
};

export type ResolvedInsightTrack = {
  country: string;
  course: string;
};

const INSIGHT_SELECT = [
  "average_return_per_dollar",
  "average_value_per_dollar_with_bonus_credit",
  "bonus_credit_percentage",
  "country",
  "course_name",
  "course_slug",
  "favourite_selections",
  "missing_price_count",
  "net_return",
  "other_starters_average_price_bucket_label",
  "other_starters_average_price_bucket_start",
  "price_bucket_label",
  "price_bucket_start",
  "race_code",
  "roi_percentage",
  "scope_key",
  "scope_type",
  "second_percentage",
  "seconds",
  "starter_count",
  "third_percentage",
  "thirds",
  "total_bonus_credit",
  "total_return",
  "total_stake",
  "total_value_with_bonus_credit",
  "win_percentage",
  "wins",
].join(",");

export const hasSupabaseInsightsConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads aggregate scope metadata used to build the Insights country and course filters.
 */
export async function fetchInsightMetadata(): Promise<InsightMetadata> {
  const [countryRows, courseRows, raceCodeRows] = await Promise.all([
    supabaseSelect<InsightMetadataRow>({
      order: "country.asc",
      scope_type: "eq.country",
      select: "scope_type,country,course_name,course_slug,race_code",
    }),
    supabaseSelect<InsightMetadataRow>({
      order: "country.asc,course_name.asc",
      scope_type: "eq.course",
      select: "scope_type,country,course_name,course_slug,race_code",
    }),
    supabaseSelect<InsightMetadataRow>({
      order: "race_code.asc",
      scope_type: "eq.race_code",
      select: "scope_type,country,course_name,course_slug,race_code",
    }),
  ]);
  const countries = unique(countryRows
    .map((row) => row.country)
    .filter((country): country is string => Boolean(country)))
    .sort();
  const disciplineOptions = [
    { label: "Horse", value: "horse" },
    { label: "Harness", value: "harness" },
    { label: "Greyhound", value: "greyhound" },
  ].filter((option) => raceCodeRows.some((row) => row.race_code === option.value));

  return {
    countryOptions: countries.map((country) => ({
      label: country,
      value: country,
    })),
    courseOptionsByCountry: buildCourseOptionsByCountry(courseRows),
    disciplineOptions,
  };
}

/**
 * Reads the stored aggregate rows needed by the current Insights filter scope.
 */
export async function fetchInsights(filters: InsightFilters): Promise<InsightsData> {
  const scope = getInsightScope(filters);
  const [overallRows, disciplineRows, disciplineFallbackRows, starterRows, priceRows, otherStartersAveragePriceRows] = await Promise.all([
    fetchOverallRows(scope),
    fetchDisciplineRows(scope),
    fetchDisciplineFallbackRows(scope),
    fetchBucketRows(scope, "starter_count"),
    fetchBucketRows(scope, "price_bucket"),
    fetchBucketRows(scope, "other_starters_average_price_bucket"),
  ]);
  const overall = overallRows[0] ?? combineAggregateRows(starterRows);
  const disciplineSourceRows = disciplineRows.length
    ? disciplineRows
    : combineRowsByRaceCode(disciplineFallbackRows);

  return {
    disciplineReturns: disciplineSourceRows.map(mapDisciplineReturn),
    favouriteStats: overall ? mapFavouriteStats(overall) : [],
    otherStartersAveragePriceBreakdown: otherStartersAveragePriceRows.map(
      mapOtherStartersAveragePriceBreakdown,
    ),
    priceBreakdown: priceRows.map(mapPriceBreakdown),
    starterBreakdown: starterRows.map(mapStarterBreakdown),
  };
}

/**
 * Returns course options for the selected country scope.
 */
export function getInsightCourseOptions(metadata: InsightMetadata | null, country: string) {
  if (!metadata) {
    return [{ label: "All tracks", value: "all" }];
  }

  return [
    { label: "All tracks", value: "all" },
    ...(metadata.courseOptionsByCountry.get(country) ?? []),
  ];
}

/**
 * Resolves the selected track filter into concrete country and course values.
 */
export function resolveInsightTrackFilter(filters: InsightFilters): ResolvedInsightTrack | null {
  if (filters.course === "all") {
    return null;
  }

  return parseCourseFilterValue(filters.country, filters.course);
}

/**
 * Chooses the stored Supabase aggregate scope for the selected filter state.
 */
function getInsightScope(filters: InsightFilters): InsightScope {
  if (filters.course !== "all") {
    const courseScope = parseCourseFilterValue(filters.country, filters.course);

    return {
      country: courseScope.country,
      course: courseScope.course,
      kind: filters.discipline === "all" ? "course" : "course_race_code",
      raceCode: filters.discipline,
    };
  }

  if (filters.country !== "all") {
    return {
      country: filters.country,
      course: "all",
      kind: filters.discipline === "all" ? "country" : "country_race_code",
      raceCode: filters.discipline,
    };
  }

  return {
    country: "all",
    course: "all",
    kind: filters.discipline === "all" ? "overall" : "race_code",
    raceCode: filters.discipline,
  };
}

/**
 * Decodes all-country course options, which carry their country to avoid slug ambiguity.
 */
function parseCourseFilterValue(country: string, courseValue: string) {
  if (country === "all") {
    const [courseCountry, ...courseParts] = courseValue.split(":");

    if (courseCountry && courseParts.length) {
      return {
        country: courseCountry,
        course: courseParts.join(":"),
      };
    }
  }

  return {
    country,
    course: courseValue,
  };
}

/**
 * Reads the one overall/country/course row that powers the KPI cards.
 */
function fetchOverallRows(scope: InsightScope) {
  if (scope.kind === "course_race_code") {
    return supabaseSelect<InsightAggregateRow>({
      scope_key: `eq.course_race_code:${scope.country}:${scope.course}:${scope.raceCode}`,
      select: INSIGHT_SELECT,
    });
  }

  if (scope.kind === "course") {
    return supabaseSelect<InsightAggregateRow>({
      scope_key: `eq.course:${scope.country}:${scope.course}`,
      select: INSIGHT_SELECT,
    });
  }

  if (scope.kind === "country_race_code") {
    return supabaseSelect<InsightAggregateRow>({
      scope_key: `eq.country_race_code:${scope.country}:${scope.raceCode}`,
      select: INSIGHT_SELECT,
    });
  }

  if (scope.kind === "country") {
    return supabaseSelect<InsightAggregateRow>({
      scope_key: `eq.country:${scope.country}`,
      select: INSIGHT_SELECT,
    });
  }

  if (scope.kind === "race_code") {
    return supabaseSelect<InsightAggregateRow>({
      scope_key: `eq.race_code:${scope.raceCode}`,
      select: INSIGHT_SELECT,
    });
  }

  return supabaseSelect<InsightAggregateRow>({
    scope_key: "eq.overall",
    select: INSIGHT_SELECT,
  });
}

/**
 * Reads race-code scoped aggregate rows for the current Insights scope.
 */
function fetchDisciplineRows(scope: InsightScope) {
  const params: Record<string, string> = {
    order: "race_code.asc",
    select: INSIGHT_SELECT,
  };

  if (scope.kind === "course") {
    params.scope_type = "eq.course_race_code";
    params.country = `eq.${scope.country}`;
    params.course_slug = `eq.${scope.course}`;
  } else if (scope.kind === "course_race_code") {
    params.scope_type = "eq.course_race_code";
    params.country = `eq.${scope.country}`;
    params.course_slug = `eq.${scope.course}`;
    params.race_code = `eq.${scope.raceCode}`;
  } else if (scope.kind === "country") {
    params.scope_type = "eq.country_race_code";
    params.country = `eq.${scope.country}`;
    params.course_slug = "is.null";
  } else if (scope.kind === "country_race_code") {
    params.scope_type = "eq.country_race_code";
    params.country = `eq.${scope.country}`;
    params.course_slug = "is.null";
    params.race_code = `eq.${scope.raceCode}`;
  } else if (scope.kind === "race_code") {
    params.scope_type = "eq.race_code";
    params.country = "is.null";
    params.course_slug = "is.null";
    params.race_code = `eq.${scope.raceCode}`;
  } else {
    params.scope_type = "eq.race_code";
    params.country = "is.null";
    params.course_slug = "is.null";
  }

  return supabaseSelect<InsightAggregateRow>(params);
}

/**
 * Reads race-code starter buckets as a fallback when direct race-code scopes are not populated yet.
 */
function fetchDisciplineFallbackRows(scope: InsightScope) {
  if (scope.kind !== "overall" && scope.kind !== "race_code") {
    return Promise.resolve([] as InsightAggregateRow[]);
  }

  const params: Record<string, string> = {
    country: "is.null",
    course_slug: "is.null",
    order: "race_code.asc,starter_count.asc",
    scope_type: "eq.starter_count",
    select: INSIGHT_SELECT,
  };

  if (scope.kind === "race_code") {
    params.race_code = `eq.${scope.raceCode}`;
  } else {
    params.race_code = "not.is.null";
  }

  return supabaseSelect<InsightAggregateRow>(params);
}

/**
 * Reads starter-count, favourite-price, or other-starter price bucket rows for the current Insights scope.
 */
function fetchBucketRows(
  scope: InsightScope,
  scopeType: "starter_count" | "price_bucket" | "other_starters_average_price_bucket",
) {
  const params: Record<string, string> = {
    order: getBucketOrder(scopeType),
    scope_type: `eq.${scopeType}`,
    select: INSIGHT_SELECT,
  };

  if (scope.raceCode !== "all") {
    params.race_code = `eq.${scope.raceCode}`;
  } else {
    params.race_code = "is.null";
  }

  if (scope.kind === "course" || scope.kind === "course_race_code") {
    params.country = `eq.${scope.country}`;
    params.course_slug = `eq.${scope.course}`;
  } else if (scope.kind === "country" || scope.kind === "country_race_code") {
    params.country = `eq.${scope.country}`;
    params.course_slug = "is.null";
  } else {
    params.country = "is.null";
    params.course_slug = "is.null";
  }

  return supabaseSelect<InsightAggregateRow>(params);
}

function getBucketOrder(scopeType: "starter_count" | "price_bucket" | "other_starters_average_price_bucket") {
  if (scopeType === "starter_count") {
    return "starter_count.asc";
  }

  if (scopeType === "other_starters_average_price_bucket") {
    return "other_starters_average_price_bucket_start.asc";
  }

  return "price_bucket_start.asc";
}

/**
 * Reads matching Supabase aggregate rows using public PostgREST access.
 */
async function supabaseSelect<TRow>(params: Record<string, string>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL("/rest/v1/insight_aggregates", publicEnv.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase insight aggregate read failed with HTTP ${response.status}`);
  }

  return await response.json() as TRow[];
}

/**
 * Builds all-country and country-scoped course options from aggregate metadata rows.
 */
function buildCourseOptionsByCountry(rows: InsightMetadataRow[]) {
  const byCountry = new Map<string, Map<string, RaceFilterOption>>();

  for (const row of rows) {
    if (!row.country || !row.course_slug || !row.course_name) {
      continue;
    }

    const countryCourses = byCountry.get(row.country) ?? new Map<string, RaceFilterOption>();
    countryCourses.set(row.course_slug, {
      label: row.course_name,
      value: row.course_slug,
    });
    byCountry.set(row.country, countryCourses);

    const allCountryCourses = byCountry.get("all") ?? new Map<string, RaceFilterOption>();
    const allCountryValue = createAllCountryCourseValue(row.country, row.course_slug);
    allCountryCourses.set(allCountryValue, {
      label: `${row.course_name} (${row.country})`,
      value: allCountryValue,
    });
    byCountry.set("all", allCountryCourses);
  }

  return new Map(Array.from(byCountry.entries()).map(([country, courses]) => [
    country,
    Array.from(courses.values()).sort((left, right) => left.label.localeCompare(right.label)),
  ]));
}

function createAllCountryCourseValue(country: string, courseSlug: string) {
  return `${country}:${courseSlug}`;
}

/**
 * Combines additive stored aggregate buckets without reading raw race rows.
 */
function combineAggregateRows(rows: InsightAggregateRow[]) {
  if (!rows.length) {
    return null;
  }

  const favouriteSelections = rows.reduce((sum, row) => sum + row.favourite_selections, 0);
  const totalStake = rows.reduce((sum, row) => sum + numeric(row.total_stake), 0);
  const totalReturn = rows.reduce((sum, row) => sum + numeric(row.total_return), 0);
  const totalBonusCredit = rows.reduce((sum, row) => sum + numeric(row.total_bonus_credit), 0);
  const totalValueWithBonusCredit = rows.reduce(
    (sum, row) => sum + numeric(row.total_value_with_bonus_credit),
    0,
  );
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  const seconds = rows.reduce((sum, row) => sum + row.seconds, 0);
  const thirds = rows.reduce((sum, row) => sum + row.thirds, 0);
  const bonusHits = rows.reduce((sum, row) => sum + bonusCreditHits(row), 0);

  return {
    ...rows[0],
    average_return_per_dollar: totalStake ? totalReturn / totalStake : 0,
    average_value_per_dollar_with_bonus_credit: totalStake
      ? totalValueWithBonusCredit / totalStake
      : 0,
    bonus_credit_percentage: favouriteSelections ? (bonusHits / favouriteSelections) * 100 : 0,
    favourite_selections: favouriteSelections,
    net_return: totalReturn - totalStake,
    roi_percentage: totalStake ? ((totalReturn - totalStake) / totalStake) * 100 : 0,
    second_percentage: favouriteSelections ? (seconds / favouriteSelections) * 100 : 0,
    seconds,
    third_percentage: favouriteSelections ? (thirds / favouriteSelections) * 100 : 0,
    thirds,
    total_bonus_credit: totalBonusCredit,
    total_return: totalReturn,
    total_stake: totalStake,
    total_value_with_bonus_credit: totalValueWithBonusCredit,
    win_percentage: favouriteSelections ? (wins / favouriteSelections) * 100 : 0,
    wins,
  } satisfies InsightAggregateRow;
}

/**
 * Rolls up race-code bucket rows into one display row per discipline.
 */
function combineRowsByRaceCode(rows: InsightAggregateRow[]) {
  const rowsByRaceCode = new Map<string, InsightAggregateRow[]>();
  const combinedRows: InsightAggregateRow[] = [];

  for (const row of rows) {
    if (!row.race_code) {
      continue;
    }

    const matchingRows = rowsByRaceCode.get(row.race_code) ?? [];
    matchingRows.push(row);
    rowsByRaceCode.set(row.race_code, matchingRows);
  }

  for (const [raceCode, raceCodeRows] of rowsByRaceCode) {
    const combined = combineAggregateRows(raceCodeRows);

    if (combined) {
      combinedRows.push({
        ...combined,
        race_code: raceCode,
      });
    }
  }

  return combinedRows.sort((left, right) =>
    String(left.race_code).localeCompare(String(right.race_code)));
}

/**
 * Converts a stored race-code aggregate row into the return metrics shown in Insights.
 */
function mapDisciplineReturn(row: InsightAggregateRow): DisciplineReturn {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    bonusAverageReturn: formatReturn(bonusAverage(row)),
    bonusCredit: formatCurrency(numeric(row.total_bonus_credit)),
    bonusHitRate: formatPercentage(numeric(row.bonus_credit_percentage)),
    discipline: toTitleCase(row.race_code ?? "Unknown"),
    missingPrices: row.missing_price_count,
    netReturn: formatCurrency(numeric(row.net_return)),
    promoAverageReturn: formatReturn(numeric(row.average_value_per_dollar_with_bonus_credit)),
    promoNetReturn: formatCurrency(
      numeric(row.total_value_with_bonus_credit) - numeric(row.total_stake),
    ),
    promoRoi: formatPercentage(promoRoi(row)),
    roi: formatPercentage(numeric(row.roi_percentage)),
    totalPromoValue: formatCurrency(numeric(row.total_value_with_bonus_credit)),
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Converts a stored starter-count aggregate row into the Insights row model.
 */
function mapStarterBreakdown(row: InsightAggregateRow): StarterBreakdown {
  return {
    bonusAverageReturn: formatReturn(bonusAverage(row)),
    bonusCredit: formatCurrency(numeric(row.total_bonus_credit)),
    bonusHitRate: formatPercentage(numeric(row.bonus_credit_percentage)),
    cashAverageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    cashNetReturn: formatCurrency(numeric(row.net_return)),
    cashReturned: formatCurrency(numeric(row.total_return)),
    cashRoi: formatPercentage(numeric(row.roi_percentage)),
    promoAverageReturn: formatReturn(numeric(row.average_value_per_dollar_with_bonus_credit)),
    promoNetReturn: formatCurrency(
      numeric(row.total_value_with_bonus_credit) - numeric(row.total_stake),
    ),
    promoRoi: formatPercentage(promoRoi(row)),
    selections: `${row.favourite_selections} selections`,
    secondRate: formatPercentage(numeric(row.second_percentage)),
    starters: `${row.starter_count ?? "Missing"} starters`,
    thirdRate: formatPercentage(numeric(row.third_percentage)),
    totalPromoValue: formatCurrency(numeric(row.total_value_with_bonus_credit)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Converts a stored favourite-price bucket row into the Insights row model.
 */
function mapPriceBreakdown(row: InsightAggregateRow): PriceBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    label: row.price_bucket_label ?? "Missing price bucket",
    netReturn: formatCurrency(numeric(row.net_return)),
    selections: `${row.favourite_selections} selections`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Converts an average-other-starters fixed-win bucket row into the Insights row model.
 */
function mapOtherStartersAveragePriceBreakdown(row: InsightAggregateRow): OtherStartersAveragePriceBreakdown {
  return {
    averageReturn: formatReturn(numeric(row.average_return_per_dollar)),
    label: row.other_starters_average_price_bucket_label ?? "Missing other-starters price bucket",
    netReturn: formatCurrency(numeric(row.net_return)),
    selections: `${row.favourite_selections} selections`,
    totalReturned: formatCurrency(numeric(row.total_return)),
    totalStaked: formatCurrency(numeric(row.total_stake)),
    winRate: formatPercentage(numeric(row.win_percentage)),
  };
}

/**
 * Converts the stored overall/country/course aggregate into the top KPI cards.
 */
function mapFavouriteStats(row: InsightAggregateRow): FavouriteStat[] {
  return [
    {
      detail: `${row.favourite_selections} selections`,
      label: "Favourite wins",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${row.seconds} finished 2nd`,
      label: "Favourite 2nd",
      value: formatPercentage(numeric(row.second_percentage)),
    },
    {
      detail: `${row.thirds} finished 3rd`,
      label: "Favourite 3rd",
      value: formatPercentage(numeric(row.third_percentage)),
    },
    {
      detail: `${bonusCreditHits(row)} credits earned`,
      label: "Bonus bet credits",
      value: formatCurrency(numeric(row.total_bonus_credit)),
    },
  ];
}

function bonusAverage(row: InsightAggregateRow) {
  const totalStake = numeric(row.total_stake);
  return totalStake ? numeric(row.total_bonus_credit) / totalStake : 0;
}

function bonusCreditHits(row: InsightAggregateRow) {
  const percentage = numeric(row.bonus_credit_percentage);

  return row.favourite_selections
    ? Math.round((percentage / 100) * row.favourite_selections)
    : 0;
}

function numeric(value: NullableNumber) {
  return Number(value ?? 0);
}

function promoRoi(row: InsightAggregateRow) {
  const totalStake = numeric(row.total_stake);
  const promoNet = numeric(row.total_value_with_bonus_credit) - totalStake;

  return totalStake ? (promoNet / totalStake) * 100 : 0;
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function formatCurrency(value: number) {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatReturn(value: number) {
  return `$${value.toFixed(2)}`;
}

function unique<TValue>(values: TValue[]) {
  return Array.from(new Set(values));
}
