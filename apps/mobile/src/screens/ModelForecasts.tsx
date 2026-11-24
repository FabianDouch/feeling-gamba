import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fetchModelForecasts, FOOTBALL_DRAW_MODEL, FORECAST_PAGE_SIZE, THOROUGHBRED_MODEL_TAB, type ForecastModel, type ForecastView, type ModelForecast, type ModelForecastPage } from "../data/supabaseModelForecasts";
import { LEAGUE_OPTIONS } from "../navigation/sportLeagueScope";

const FETCH_TIMEOUT_MS = 20_000;
const decimalOdds = new Intl.NumberFormat("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 20, useGrouping: false });

// Remount on scope switches so paging and results always match the selected model and league.
export function ModelForecasts({ model, view, league = null, onSelectLeague }: {
  model: ForecastModel;
  view: ForecastView;
  league?: string | null;
  onSelectLeague?: (league: string) => void;
}) {
  return <ForecastList key={`${model}:${view}:${league}`} model={model} view={view} league={league} onSelectLeague={onSelectLeague} />;
}

// Read one page at a time and hide finished events from the open current view.
function ForecastList({ model, view, league, onSelectLeague }: {
  model: ForecastModel; view: ForecastView; league: string | null; onSelectLeague?: (league: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [showBins, setShowBins] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ key: string; data?: ModelForecastPage; error?: string }>();
  const requestKey = `${page}:${reload}`;
  const state = result?.key === requestKey ? result : undefined;
  const football = model === FOOTBALL_DRAW_MODEL;
  const history = view === "history";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    fetchModelForecasts(model, view, league, page, controller.signal)
      .then((data) => {
        if (!active) return;
        setNow(Date.now());
        const maxPage = Math.max(0, Math.ceil(data.summary.total / FORECAST_PAGE_SIZE) - 1);
        if (page > maxPage) setPage(maxPage);
        else setResult({ key: requestKey, data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = controller.signal.aborted ? "The forecast request timed out."
          : error instanceof Error ? error.message : "Unable to load forecasts.";
        setResult({ key: requestKey, error: message });
      })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [model, view, league, page, requestKey]);

  const data = state?.data;
  const entries = history ? data?.entries ?? [] : (data?.entries ?? []).filter((row) => Date.parse(row.eventAt) > now);
  const nextStart = !history && entries.length ? Date.parse(entries[0].eventAt) : null;
  useEffect(() => {
    if (nextStart === null) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      setReload((value) => value + 1);
    }, Math.max(0, nextStart - Date.now()));
    return () => clearTimeout(timer);
  }, [nextStart]);

  const pages = data ? Math.ceil(data.summary.total / FORECAST_PAGE_SIZE) : 0;
  return <View style={styles.content}>
    <Text style={styles.title}>{football ? "Football draw forecast" : THOROUGHBRED_MODEL_TAB.label}</Text>
    <Text style={styles.note}>{football
      ? "Compare the model’s draw estimate with the probability implied by captured TAB odds."
      : "Compare the win estimate with the saved favourite’s captured odds and the historical win rate for its price band."}</Text>
    {history ? <Text style={styles.note}>Only forecasts saved before the event are included.</Text> : null}
    <ForecastButton label="Refresh forecasts" onPress={() => setReload((value) => value + 1)} />
    {!state ? <Text style={styles.note}>Loading forecasts…</Text> : null}
    {state?.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error} Refresh to retry.</Text> : null}
    {data && history ? <ForecastScores data={data} football={football} showBins={showBins} onToggleBins={() => setShowBins((value) => !value)} /> : null}
    {data && !entries.length ? <Text style={styles.note}>{history ? "No forecasts have reached their scheduled start yet."
      : football ? "No upcoming matches have a saved draw forecast in this league scope."
        : "No upcoming thoroughbreds have a saved forecast yet."}</Text> : null}
    {entries.map((row) => <ForecastCard key={row.id} row={row} football={football} history={history} onSelectLeague={league === null ? onSelectLeague : undefined} />)}
    {pages > 1 ? <View style={styles.row}>
      <ForecastButton label="Previous" disabled={page === 0} onPress={() => setPage(page - 1)} />
      <Text style={styles.note}>Page {page + 1} of {pages}</Text>
      <ForecastButton label="Next" disabled={page + 1 >= pages} onPress={() => setPage(page + 1)} />
    </View> : null}
  </View>;
}

// Give both baselines and model scores the same denominator, independent of the page shown.
function ForecastScores({ data, football, showBins, onToggleBins }: { data: ModelForecastPage; football: boolean; showBins: boolean; onToggleBins: () => void }) {
  const { summary, scores, bins } = data;
  return <View style={styles.card}>
    <Text style={styles.title}>Recorded performance</Text>
    <Text style={styles.note}>{summary.total} recorded · {summary.settled} settled · {summary.pending} awaiting result · {summary.excluded} excluded</Text>
    {summary.unavailable > 0 ? <Text style={styles.note}>{summary.unavailable} with insufficient training history</Text> : null}
    {scores.paired === 0 ? <Text style={styles.note}>Scores appear after forecasts with a model estimate settle.</Text> : <>
      <Text style={styles.note}>{scores.paired} scored · {scores.targetOutcomes} {football ? "draws" : "favourite wins"} · lower scores are better</Text>
      <Text style={styles.note}>{football ? "Draw Brier" : "Win Brier"}: Model {score(scores.modelBrier)} · Odds baseline {score(scores.baselineBrier)}</Text>
      <Text style={styles.note}>{football ? "Three-way log loss" : "Win/loss log loss"}: Model {score(scores.modelLogLoss)} · Odds baseline {score(scores.baselineLogLoss)}</Text>
      {bins.length > 0 ? <ForecastButton label={showBins ? "Hide probability breakdown" : "Show probability breakdown"} onPress={onToggleBins} /> : null}
      {showBins ? bins.map((bin) => <Text key={`${bin.variant}:${bin.bin}`} style={styles.note}>
        {bin.variant === "model" ? "Model" : "Odds baseline"} {bin.bin * 10}–{(bin.bin + 1) * 10}% · {bin.sample} scored · {percent(bin.predicted)} average forecast · {percent(bin.observed)} observed
      </Text>) : null}
    </>}
  </View>;
}

// Display quoted decimal prices separately from probability estimates and settlement.
function ForecastCard({ row, football, history, onSelectLeague }: { row: ModelForecast; football: boolean; history: boolean; onSelectLeague?: (league: string) => void }) {
  const league = LEAGUE_OPTIONS.football.find((item) => item.value === row.sourceGroup)?.label ?? row.sourceGroup;
  const race = [row.course, row.raceNumber !== null ? `Race ${row.raceNumber}` : null, row.country].filter(Boolean).join(" · ");
  const band = row.priceBand;
  return <View style={styles.card} testID="model-forecast-card">
    <Text style={styles.note}>{football ? league : race || "Thoroughbred"} · {nzTime(row.eventAt)}</Text>
    <Text style={styles.title}>{football ? `${row.home} v ${row.away}` : `${row.runnerNumber ?? ""} ${row.runner ?? "Favourite"}`.trim()}</Text>
    <Text style={styles.probability}>{football ? "Model draw" : "Model win"} {percent(football ? row.estimate?.draw : row.estimate?.win)} · Odds baseline {percent(football ? row.baseline.draw : row.baseline.win)}</Text>
    {football ? <>
      <Text style={styles.note}>Captured TAB odds · Home {odds(row.prices.home)} · Draw {odds(row.prices.draw)} · Away {odds(row.prices.away)}</Text>
      {row.estimate ? <Text style={styles.note}>Model · Home {percent(row.estimate.home)} · Draw {percent(row.estimate.draw)} · Away {percent(row.estimate.away)}</Text> : null}
      <Text style={styles.note}>Odds baseline · Home {percent(row.baseline.home)} · Draw {percent(row.baseline.draw)} · Away {percent(row.baseline.away)}</Text>
    </> : <>
      <Text style={styles.note}>Captured favourite odds · {odds(row.prices.favourite)} · {row.sourceGroup === "betcha" ? "Betcha" : row.sourceGroup}</Text>
      {band ? <Text style={styles.note}>Historical {odds(band.from)} to under {odds(band.toExclusive)} · {band.wins} wins from {band.sample} races{band.winRate === null ? " · Limited history" : ` · ${percent(band.winRate)} win rate`}</Text> : null}
    </>}
    {row.estimate === null ? <Text style={styles.note}>Model estimate unavailable · Insufficient training history</Text> : null}
    <Text style={styles.note}>Odds captured {nzTime(row.capturedAt)} · Forecast saved {nzTime(row.forecastAt)} · {row.trainingSample} training {football ? "matches" : "races"}</Text>
    {history ? <Text style={styles.title}>{outcomeLabel(row)}{row.settledAt ? ` · ${nzTime(row.settledAt)}` : ""}</Text> : null}
    {football && onSelectLeague ? <ForecastButton label={`Open ${league}`} onPress={() => onSelectLeague(row.sourceGroup)} /> : null}
  </View>;
}

// Show only the actual settled result for this saved event.
function outcomeLabel(row: ModelForecast): string {
  if (row.status === "excluded") return "Excluded from scoring";
  if (row.status !== "settled") return "Awaiting result";
  if (row.actual === "draw") return "Draw";
  if (row.actual === "home" || row.actual === "away") return `${row[row.actual]} won`;
  return row.actual === "win" ? "Favourite won" : "Favourite did not win";
}

// Keep controls accessible and consistent with the existing prediction cards.
function ForecastButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

// Format source times consistently with the rest of the app.
function nzTime(value: string) { return `${new Date(value).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZ`; }
// Keep unavailable probabilities distinct from zero.
function percent(value: number | null | undefined) { return value == null ? "—" : `${(value * 100).toFixed(1)}%`; }
// Display the captured decimal quote without deriving it from the estimates.
function odds(value: number | null | undefined) { return value == null ? "—" : `$${decimalOdds.format(value)}`; }
// Use the same precision for both sides of a comparison.
function score(value: number | null) { return value == null ? "—" : value.toFixed(4); }

const styles = StyleSheet.create({
  content: { gap: 12 },
  card: { borderWidth: 1, borderColor: "#e4e7ec", borderRadius: 8, padding: 12, gap: 8 },
  title: { color: "#18202f", fontSize: 14, fontWeight: "800" },
  probability: { color: "#18202f", fontSize: 16, fontWeight: "800" },
  note: { color: "#667085", fontSize: 13, lineHeight: 19 },
  error: { color: "#9a3412", fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  button: { alignSelf: "flex-start", borderColor: "#d7dce7", borderWidth: 1, borderRadius: 6, padding: 10 },
  buttonText: { color: "#344054", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
