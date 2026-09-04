import { publicEnv } from "../config/env";
import type { FavouriteStat } from "./collectedRaceDay";
import {
  UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY,
  UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY,
  UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY,
  WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY,
  type WinPercentageMultiModelKey,
} from "./supabasePredictions";

type NullableNumber = number | string | null;

export type HistoricalBacktestSport = "racing" | "ufc";
export type HistoricalBacktestRankFilter = "all" | "2" | "3" | "4";

type HistoricalBacktestSummaryRow = {
  average_return_per_dollar: NullableNumber;
  missing_result_count: number;
  net_return: NullableNumber;
  pending_count: number;
  prediction_count: number;
  prediction_model: string;
  roi_percentage: NullableNumber;
  settled_count: number;
  sport: HistoricalBacktestSport;
  total_return: NullableNumber;
  total_stake: NullableNumber;
  win_percentage: NullableNumber;
  wins: number;
};

export const hasSupabaseHistoricalBacktestConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseKey,
);

/**
 * Reads all-time historical model backtest performance for the selected multi model.
 */
export async function fetchHistoricalMultiBacktestPerformance(
  sport: HistoricalBacktestSport,
  predictionModel: WinPercentageMultiModelKey,
  rankFilter: HistoricalBacktestRankFilter,
): Promise<FavouriteStat[]> {
  const rows = await supabaseRpc<HistoricalBacktestSummaryRow[]>("get_historical_multi_backtest_summary", {
    p_max_leg_rank: rankFilter === "all" ? null : Number(rankFilter),
    p_prediction_model: predictionModel,
    p_sport: sport,
  });
  const summary = rows[0] ?? null;

  return summary && summary.prediction_count > 0
    ? mapHistoricalBacktestStats(summary)
    : [];
}

async function supabaseRpc<TResult>(name: string, body: Record<string, unknown>) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error("Supabase client configuration is missing.");
  }

  const url = new URL(`/rest/v1/rpc/${name}`, publicEnv.supabaseUrl);
  const response = await fetch(url.toString(), {
    body: JSON.stringify(body),
    headers: {
      apikey: publicEnv.supabaseKey,
      authorization: `Bearer ${publicEnv.supabaseKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Supabase historical backtest RPC ${name} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  return await response.json() as TResult;
}

function mapHistoricalBacktestStats(row: HistoricalBacktestSummaryRow): FavouriteStat[] {
  return [
    {
      detail: `${row.settled_count} settled · ${row.pending_count} pending`,
      label: getHistoricalBacktestModelLabel(row.prediction_model),
      value: String(row.prediction_count),
    },
    {
      detail: `${row.wins} wins from ${row.settled_count} settled`,
      label: "Win rate",
      value: formatPercentage(numeric(row.win_percentage)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned on ${formatCurrency(numeric(row.total_stake))} staked`,
      label: "Cash avg",
      value: formatReturn(numeric(row.average_return_per_dollar)),
    },
    {
      detail: `${formatCurrency(numeric(row.total_return))} returned on ${formatCurrency(numeric(row.total_stake))} staked`,
      label: "Cash net",
      value: formatCurrency(numeric(row.net_return)),
    },
    {
      detail: `${formatPercentage(numeric(row.roi_percentage))} ROI · ${row.missing_result_count} missing results`,
      label: "Open issues",
      value: String(row.missing_result_count),
    },
  ];
}

function getHistoricalBacktestModelLabel(model: string) {
  if (model === WIN_PERCENTAGE_60_PLUS_MULTI_MODEL_KEY) {
    return "60%+ win multis";
  }

  if (model === WIN_PERCENTAGE_65_PLUS_MULTI_MODEL_KEY) {
    return "65%+ win multis";
  }

  if (model === WIN_PERCENTAGE_50_50_65_PLUS_MULTI_MODEL_KEY) {
    return "50/50 65%+ win multis";
  }

  if (model === UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY) {
    return "UFC favourite price multis";
  }

  if (model === UFC_OTHER_FIGHTER_PRICE_MULTI_MODEL_KEY) {
    return "UFC other fighter price multis";
  }

  if (model === UFC_OTHER_FIGHTER_PRICE_TOP6_MULTI_MODEL_KEY) {
    return "UFC other fighter price top 6 multis";
  }

  if (model === UFC_PRICE_DIFFERENCE_MULTI_MODEL_KEY) {
    return "UFC price difference multis";
  }

  return "Win percentage multis";
}

function numeric(value: NullableNumber) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  const absoluteValue = Math.abs(value).toFixed(2);

  return value < 0 ? `-$${absoluteValue}` : `$${absoluteValue}`;
}

function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatReturn(value: number) {
  return formatCurrency(value);
}
