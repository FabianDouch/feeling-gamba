import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  fetchFootballTrial, type FootballHistoryMode, type FootballHistoryVariation, type TrialEntry, type TrialModel,
} from "../data/supabaseFootballTrial";

// Display missing learned probabilities explicitly rather than replacing them with market odds.
function probability(value: number | null) { return value === null ? "Insufficient history" : `${(value * 100).toFixed(1)}%`; }

// Preserve unavailable accuracy metrics before the selected model has scored predictions.
function score(value: number | null | undefined) { return value == null ? "—" : value.toFixed(4); }

// Match each history row to the chosen variation without combining model probabilities.
function modelProbability(entry: TrialEntry, model: TrialModel) {
  return model === "market" ? entry.market_probability : model === "bucket" ? entry.bucket_probability : entry.rich_probability;
}

// Render the selected football single variation beneath the shared league/format/type/model controls.
export function FootballPriceGapHistory({ league, variation }: { league: string | null; variation: FootballHistoryVariation }) {
  const [mode, setMode] = useState<FootballHistoryMode>("backtest");
  const [pagination, setPagination] = useState({ scope: "", page: 0 });
  const [reload, setReload] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loaded, setLoaded] = useState<{
    key: string; result: Awaited<ReturnType<typeof fetchFootballTrial>> | null; error: string | null;
  } | null>(null);
  const isBacktest = mode === "backtest";
  const scope = `${league ?? "all"}:${variation.cohort}:${mode}`;
  const page = pagination.scope === scope ? pagination.page : 0;
  const requestKey = `${scope}:${page}:${reload}`;
  const data = loaded?.key === requestKey ? loaded.result : null;
  const error = loaded?.key === requestKey ? loaded.error : null;
  const selectedModel = data?.summary.models.find((model) => model.model === variation.model);

  useEffect(() => {
    let cancelled = false;
    fetchFootballTrial(league, variation.cohort, page, mode).then((result) => {
      if (!cancelled) setLoaded({ key: requestKey, result, error: null });
    }).catch((reason: unknown) => {
      if (!cancelled) setLoaded({ key: requestKey, result: null,
        error: reason instanceof Error ? reason.message : "Unable to load football history." });
    });
    return () => { cancelled = true; };
  }, [league, variation.cohort, mode, page, requestKey]);

  return <View style={styles.section}>
    <View>
      <Text style={styles.filterLabel}>History source</Text>
      <View style={styles.controls}>
        {(["backtest", "forward"] as const).map((value) => <Pressable key={value} accessibilityRole="button"
          accessibilityState={{ selected: mode === value }} aria-pressed={mode === value} style={[styles.filter, mode === value && styles.filterActive]}
          onPress={() => setMode(value)}>
          <Text style={[styles.filterText, mode === value && styles.filterTextActive]}>{value === "backtest" ? "Historical backtest" : "Forward trial"}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" style={styles.filter} onPress={() => setReload((n) => n + 1)}>
          <Text style={styles.filterText}>Refresh</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>{isBacktest
        ? "Reconstructed from captured odds and earlier matches, assuming results were available 24 hours after kickoff. Actual historical publication times are unverified."
        : "Predictions saved before kickoff, with outcomes reconciled after the match."}</Text>
    </View>
    {error ? <Text style={styles.error}>History unavailable: {error}</Text> : !data ? <Text style={styles.note}>Loading football prediction history…</Text> : <>
      <Text style={styles.heading}>Single prediction performance</Text>
      <View style={styles.statsRow}>
        <Metric value={String(selectedModel?.scored ?? 0)} label="Scored predictions" detail={`${selectedModel?.unavailable ?? 0} with insufficient history`} />
        <Metric value={score(selectedModel?.brier)} label="Brier score" detail="Lower is better" />
        <Metric value={score(selectedModel?.log_loss)} label="Log loss" detail="Lower is better" />
      </View>
      {variation.model !== "market" && selectedModel ? <Text style={styles.note}>
        Market baseline on the same {selectedModel.scored} matches: Brier {score(selectedModel.paired_market_brier)} · Log loss {score(selectedModel.paired_market_log_loss)}.
      </Text> : null}
      {data.summary.recorded === 0 ? <Text style={styles.emptyState}>{isBacktest
        ? "No historical matches for this league and variation. Choose All football or another variation."
        : "No forward forecasts recorded for this league and variation yet."}</Text> : null}
      <Text style={styles.heading}>Price-gap match outcomes</Text>
      <View style={styles.statsRow}>
        <Metric value={`${data.summary.wins}/${data.summary.settled}`} label="Favourite wins"
          detail={data.summary.settled ? `${(100 * data.summary.wins / data.summary.settled).toFixed(1)}% win rate` : "No settled matches"} />
        <Metric value={`$${Number(data.summary.returned).toFixed(2)}`} label="Cash returned" detail={`$${Number(data.summary.staked).toFixed(2)} notional stake`} />
        <Metric value={`$${Number(data.summary.net).toFixed(2)}`} label="Cash net"
          detail={data.summary.roi === null ? "No settled return" : `${Number(data.summary.roi).toFixed(1)}% ROI`} />
      </View>
      <Text style={styles.note}>Returns cover all {data.summary.settled} settled favourites in this price-gap group, including matches without a model probability. Each uses a notional $1 stake; draws lose.</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDiagnostics }} aria-expanded={showDiagnostics} onPress={() => setShowDiagnostics((value) => !value)}>
        <Text style={styles.detailToggle}>{showDiagnostics ? "Hide model diagnostics" : "Show model diagnostics"}</Text>
      </Pressable>
      {showDiagnostics ? <View style={styles.diagnostics}>
        <Text style={styles.filterLabel}>Calibration · selected model</Text>
        {data.summary.calibration.filter((bin) => bin.model === variation.model).map((bin) => <Text key={bin.bin} style={styles.note}>
          {bin.bin * 10}–{(bin.bin + 1) * 10}% band · predicted {probability(bin.predicted)} · observed {probability(bin.actual)} · {bin.sample} matches
        </Text>)}
        {!(selectedModel?.scored) ? <Text style={styles.note}>No scored probabilities for this variation yet.</Text> : null}
        <Text style={styles.note}>The $2.00+ group includes the $2.00–$2.49 group. Their counts must not be added together.</Text>
        {data.summary.built_at ? <Text style={styles.note}>Backtest rebuilt {new Date(data.summary.built_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZ.</Text> : null}
      </View> : null}
      <Text style={styles.heading}>Prediction history</Text>
      <Text style={styles.note}>{data.summary.recorded} {isBacktest ? "replayed matches" : "forecasts"} · {data.summary.settled} settled · {data.summary.pending} pending · {data.summary.excluded} excluded · all collected dates</Text>
      {data.entries.map((entry) => {
        const p = modelProbability(entry, variation.model);
        const sample = variation.model === "bucket" ? entry.bucket_sample : entry.rich_sample;
        return <View key={entry.id} style={styles.historyRow}>
          <View style={styles.historyHeader}>
            <Text style={styles.matchTitle}>{entry.home_team_name} v {entry.away_team_name}</Text>
            <Text style={[styles.outcome, entry.won === true && styles.outcomeWin]}>{entry.outcome_status === "settled" ? entry.won ? "Won" : "Lost" : entry.outcome_status === "excluded" ? "Excluded" : "Pending"}</Text>
          </View>
          <Text style={styles.note}>{entry.league.toUpperCase()} · {new Date(entry.kickoff_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZ</Text>
          <Text style={styles.selection}>{entry.favourite_home ? entry.home_team_name : entry.away_team_name} · ${Number(entry.favourite_price).toFixed(2)} · gap ${Number(entry.price_gap).toFixed(2)}</Text>
          <Text style={styles.prediction}>{probability(p)}{variation.model !== "market" ? ` · ${sample} earlier matches` : " · market-implied win probability"}</Text>
          <Text style={styles.note}>{isBacktest ? "Replay odds captured" : "Forecast saved"} {new Date(entry.predicted_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZ</Text>
          <Text style={styles.selection}>{entry.unit_return === null ? entry.outcome_status === "excluded" ? "Return excluded" : "Return pending" : `$${Number(entry.unit_return).toFixed(2)} returned per $1`}</Text>
        </View>;
      })}
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" disabled={page === 0} style={[styles.filter, page === 0 && styles.disabled]}
          onPress={() => setPagination({ scope, page: page - 1 })}><Text style={styles.filterText}>Previous</Text></Pressable>
        <Text style={styles.note}>Page {page + 1} of {Math.max(1, Math.ceil(data.total / 20))}</Text>
        <Pressable accessibilityRole="button" disabled={(page + 1) * 20 >= data.total}
          style={[styles.filter, (page + 1) * 20 >= data.total && styles.disabled]}
          onPress={() => setPagination({ scope, page: page + 1 })}><Text style={styles.filterText}>Next</Text></Pressable>
      </View>
    </>}
  </View>;
}

// Match the compact performance cards used by the other prediction-history branches.
function Metric({ value, label, detail }: { value: string; label: string; detail: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.note}>{detail}</Text></View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 }, heading: { color: "#18202f", fontSize: 13, fontWeight: "900", marginTop: 14 },
  note: { color: "#667085", fontSize: 12, lineHeight: 17, marginTop: 4 },
  filterLabel: { color: "#344054", fontSize: 12, fontWeight: "800", marginBottom: 7 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  filter: { backgroundColor: "#ffffff", borderColor: "#d7dce7", borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  filterActive: { backgroundColor: "#18202f", borderColor: "#18202f" },
  filterText: { color: "#475467", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#ffffff", fontWeight: "700" }, disabled: { opacity: 0.4 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { backgroundColor: "#f8fafc", borderColor: "#e4e7ec", borderWidth: 1, borderRadius: 8, padding: 12, flexGrow: 1, flexBasis: 130 },
  statValue: { color: "#18202f", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#344054", fontSize: 12, fontWeight: "800", marginTop: 4 },
  historyRow: { borderTopColor: "#e4e7ec", borderTopWidth: 1, paddingVertical: 12, gap: 4 },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  matchTitle: { color: "#18202f", flex: 1, fontSize: 14, fontWeight: "900", lineHeight: 19 },
  selection: { color: "#18202f", fontSize: 13, fontWeight: "800", marginTop: 4 },
  prediction: { color: "#344054", fontSize: 13, fontWeight: "700" },
  outcome: { color: "#475467", fontSize: 11, fontWeight: "900", backgroundColor: "#f8fafc", borderRadius: 6, padding: 7 },
  outcomeWin: { color: "#067647", backgroundColor: "#ecfdf3" },
  detailToggle: { color: "#344054", fontSize: 12, fontWeight: "800" },
  diagnostics: { backgroundColor: "#f8fafc", borderColor: "#e4e7ec", borderWidth: 1, borderRadius: 8, padding: 12 },
  emptyState: { color: "#667085", backgroundColor: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 19 },
  error: { color: "#9a3412", fontSize: 13, lineHeight: 19 },
});
