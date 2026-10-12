import assert from "node:assert/strict";
import test from "node:test";

for (const league of ["epl", "ucl", "laliga", "bundesliga", "seriea", "ligue1", "mls", "europaleague", "eflcup", "nationsleague"]) {
  test(`${league} market refresh generates current football forecasts in the same run as capture and reconciliation`, async () => {
    const { parseArgs, buildRefreshCommands } = await import(`../scripts/refresh-${league}-current-markets.mjs`);
    const commands = buildRefreshCommands(parseArgs(['--require-supabase', '--batch-size=100']));
    const labels = commands.map((command) => command.label);
    const forecastIndex = labels.indexOf('refresh_football_price_gap_forecasts');
    assert(forecastIndex > labels.indexOf(`capture_${league}_fixed_win_markets`));
    assert(forecastIndex > labels.indexOf(`reconcile_${league}_fixed_win`));
    assert(forecastIndex < labels.indexOf(`rebuild_${league}_insights`));
    assert(commands[forecastIndex].args[0].endsWith('/refresh-football-price-gap-trial.mjs'));
    assert.deepEqual(commands[forecastIndex].args.slice(1), ['--require-supabase']);
    const dry = buildRefreshCommands(parseArgs(['--dry-run', '--require-supabase']));
    assert.deepEqual(dry.find((command) => command.label === 'refresh_football_price_gap_forecasts').args.slice(1), ['--dry-run', '--require-supabase']);
    const skipped = buildRefreshCommands(parseArgs(['--skip-predictions']));
    assert(!skipped.some((command) => command.label === 'refresh_football_price_gap_forecasts'));
  });
}
