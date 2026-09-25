import { fileURLToPath } from "node:url";
import { LEAGUES } from "./lib/football-price-gap-trial.mjs";
import { replayFootballHistory } from "./lib/football-price-gap-backtest.mjs";
import { createClient, loadEnv } from "./refresh-football-price-gap-trial.mjs";

// Read every league before replacing the derived backtest, so partial source failures cannot erase history.
export async function backfillFootballHistory(client, { dryRun = false } = {}) {
  const results = [];
  for (const league of LEAGUES) {
    const rows = await client.all(`${league}_fixed_win_snapshot_results`, {
      select: "source_event_id,source_snapshot_key,snapshot_at,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price,draw_fixed_win_price,home_team_won,away_team_won,match_drawn,outcome_status",
    });
    results.push(...rows.map((row) => ({ ...row, league })));
  }
  const replay = replayFootballHistory(results, new Date().toISOString());
  if (!dryRun) {
    await client.request("rpc/replace_football_price_gap_backtests", {}, "POST", {
      p_rows: replay.rows, p_generated_at: replay.summary.generatedAt,
    });
  }
  return { dryRun, ...replay.summary };
}

// Build historical results on demand; dry runs need no backtest schema and perform no writes.
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--dry-run", "--require-supabase"].includes(arg))) throw new Error("Supported flags: --dry-run, --require-supabase");
  await loadEnv();
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.FEELING_GAMBA_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service key are required.");
  console.log(JSON.stringify(await backfillFootballHistory(createClient(url, key), { dryRun: args.includes("--dry-run") }), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
