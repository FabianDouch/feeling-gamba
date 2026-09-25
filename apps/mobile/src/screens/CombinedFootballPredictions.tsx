import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fetchUpcomingFootballForecasts, FOOTBALL_HISTORY_VARIATIONS, type FootballHistoryVariation, type FootballHistoryVariationKey } from "../data/supabaseFootballTrial";
import { footballForecastProbability, isUpcomingFootballForecast } from "../data/footballForecastReader";
import { LEAGUE_OPTIONS } from "../navigation/sportLeagueScope";
import { PredictionFormatTabs, PredictionModelTabs, PredictionTypeTabs, type PredictionFormat } from "./PredictionControls";

// Use the same six variations as history for all football scopes, retaining selection during league drilldowns.
export function CombinedFootballPredictions({ league, variationKey, onVariationChange, onSelectLeague, format, onFormatChange }: {
  format: PredictionFormat; onFormatChange: (format: PredictionFormat) => void;
  league: string | null; variationKey: FootballHistoryVariationKey;
  onVariationChange: (key: FootballHistoryVariationKey) => void; onSelectLeague: (league: string) => void;
}) {
  const variation = FOOTBALL_HISTORY_VARIATIONS.find((item) => item.key === variationKey) ?? FOOTBALL_HISTORY_VARIATIONS[0];
  return <View style={styles.section}>
    <Text style={styles.eyebrow}>Predictions</Text>
    <Text style={styles.heading}>Upcoming football predictions</Text>
    <PredictionFormatTabs activeFormat={format} onChange={onFormatChange} />
    <PredictionTypeTabs activeType="win_percentage" onChange={() => undefined}
      options={[{ label: "Win %", value: "win_percentage", description: "Probability-based fixed-win models." }]} />
    {format === "singles" ? <>
      <PredictionModelTabs activeModelKey={variationKey} models={FOOTBALL_HISTORY_VARIATIONS} onChange={onVariationChange} />
      <View style={styles.info}><Text style={styles.title}>{variation.label}</Text><Text style={styles.note}>{variation.description}</Text><Text style={styles.note}>{variation.detail}</Text></View>
      <FootballPredictionList key={`${league ?? "all"}:${variationKey}`} league={league} variation={variation} onSelectLeague={onSelectLeague} />
    </> : <Text style={styles.note}>No football multi prediction model is available yet. Choose Singles to view upcoming matches.</Text>}
  </View>;
}

// Keep unavailable learned models explicit, and expire cards at kickoff even while this view remains open.
function FootballPredictionList({ league, variation, onSelectLeague }: { league: string | null; variation: FootballHistoryVariation; onSelectLeague: (league: string) => void }) {
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState<{ key: number; data: Awaited<ReturnType<typeof fetchUpcomingFootballForecasts>> | null; error: string | null } | null>(null);
  const current = loaded?.key === reload ? loaded : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchUpcomingFootballForecasts(league, variation.cohort).then((data) => {
      if (!cancelled) { setNow(Date.now()); setLoaded({ key: reload, data, error: null }); }
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: reload, data: null, error: error instanceof Error ? error.message : "Unable to load predictions." });
    });
    return () => { cancelled = true; };
  }, [league, variation.cohort, reload]);
  const data = current?.data;
  const candidates = data?.entries.filter((entry) => isUpcomingFootballForecast(entry, now)) ?? [];
  const predictions = candidates.filter((entry) => footballForecastProbability(entry, variation) !== null);
  const unavailable = candidates.length - predictions.length;
  const activePage = Math.min(page, Math.max(0, Math.ceil(predictions.length / 20) - 1));
  return <View style={styles.sectionContent}>
    <Pressable accessibilityRole="button" onPress={() => { setPage(0); setReload((value) => value + 1); }} style={styles.button}><Text style={styles.buttonText}>Refresh predictions</Text></Pressable>
    <Text style={styles.note}>Favourite-to-win recommendations from the models tracked in Prediction History. Forecasts are saved within 24 hours of kickoff using prices captured within the previous hour. Draws count as losses.</Text>
    {!current ? <Text style={styles.note}>Loading football predictions…</Text> : current.error ? <Text style={styles.error}>{current.error} Refresh to retry.</Text> : data ? <>
      <Text style={styles.title}>{predictions.length} upcoming recommendations · {league ? leagueLabel(league) : "All 10 football leagues"}</Text>
      <Text style={styles.note}>Checked {formatTime(data.checkedAt)} NZ. Prices below were captured when the forecast was saved and may have changed.</Text>
      {unavailable > 0 ? <Text style={styles.note}>Insufficient history: {unavailable} qualifying {unavailable === 1 ? "match has" : "matches have"} no probability for this model yet. {variation.detail}</Text> : null}
      {predictions.length === 0 ? <Text style={styles.note}>{unavailable > 0
        ? "No recommendations are ready for this variation. Market odds variations can show these matches using their captured market probability."
        : "No qualifying upcoming forecasts have been saved for this price-gap range yet. New forecasts appear after a scheduled check finds a match within 24 hours of kickoff with fresh three-way prices."}</Text> : null}
      {predictions.slice(activePage * 20, (activePage + 1) * 20).map((item) => <View key={`${item.league}:${variation.key}:${item.id}`} testID="football-prediction-card" style={styles.card}>
        <View style={styles.cardHeader}><Text style={styles.badge}>{leagueLabel(item.league)}</Text><Text style={styles.note}>{variation.label}</Text></View>
        <Text style={styles.title}>{item.favourite_home ? item.home_team_name : item.away_team_name} to win</Text>
        <Text style={styles.note}>{item.home_team_name} v {item.away_team_name} · {formatTime(item.kickoff_at)} NZ</Text>
        <Text style={styles.score}>{(footballForecastProbability(item, variation)! * 100).toFixed(1)}% win probability · ${item.favourite_price.toFixed(2)} captured odds</Text>
        <Text style={styles.note}>Price gap ${item.price_gap.toFixed(2)}{variation.model === "bucket" ? ` · ${item.bucket_sample} earlier matches in this range` : variation.model === "rich" ? ` · ${item.rich_sample} earlier training matches` : " · Normalised home/draw/away market"}</Text>
        <Text style={styles.note}>Forecast saved {formatTime(item.predicted_at)} NZ · Prices captured {formatTime(item.snapshot_at)} NZ</Text>
        {league === null ? <Pressable accessibilityRole="button" onPress={() => onSelectLeague(item.league)}><Text style={styles.link}>Open {leagueLabel(item.league)}</Text></Pressable> : null}
      </View>)}
      {predictions.length > 20 ? <View style={styles.cardHeader}>
        <Pressable accessibilityRole="button" disabled={activePage === 0} onPress={() => setPage(activePage - 1)} style={[styles.button, activePage === 0 && styles.disabled]}><Text style={styles.buttonText}>Previous</Text></Pressable>
        <Text style={styles.note}>Page {activePage + 1} of {Math.ceil(predictions.length / 20)}</Text>
        <Pressable accessibilityRole="button" disabled={(activePage + 1) * 20 >= predictions.length} onPress={() => setPage(activePage + 1)} style={[styles.button, (activePage + 1) * 20 >= predictions.length && styles.disabled]}><Text style={styles.buttonText}>Next</Text></Pressable>
      </View> : null}
    </> : null}
  </View>;
}

// Resolve the same league labels used by the shared navigation.
function leagueLabel(league: string): string {
  return LEAGUE_OPTIONS.football.find((item) => item.value === league)?.label ?? league;
}

// Show captured and kickoff timestamps in the app's NZ timezone.
function formatTime(value: string): string {
  return new Date(value).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" });
}
const styles = StyleSheet.create({
  section: { backgroundColor: "#fff", borderColor: "#d7dce7", borderWidth: 1, borderRadius: 8, padding: 16, gap: 12 },
  sectionContent: { gap: 12 }, eyebrow: { color: "#667085", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  heading: { color: "#18202f", fontSize: 20, fontWeight: "900" }, title: { color: "#18202f", fontSize: 14, fontWeight: "800" },
  note: { color: "#667085", fontSize: 12, lineHeight: 18 }, info: { backgroundColor: "#f8fafc", borderRadius: 8, padding: 12, gap: 6 },
  coverage: { gap: 4, borderBottomColor: "#e4e7ec", borderBottomWidth: 1, paddingBottom: 8 },
  button: { borderColor: "#d7dce7", borderWidth: 1, borderRadius: 6, padding: 10, alignSelf: "flex-start" },
  buttonText: { color: "#344054", fontSize: 12, fontWeight: "700" }, link: { color: "#175cd3", fontSize: 12, fontWeight: "700" },
  card: { borderColor: "#e4e7ec", borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  cardHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }, badge: { backgroundColor: "#f2f4f7", color: "#344054", padding: 7, borderRadius: 6, fontSize: 12, fontWeight: "800" },
  score: { color: "#18202f", fontSize: 16, fontWeight: "800" }, error: { color: "#9a3412", fontSize: 13, lineHeight: 19 }, disabled: { opacity: 0.4 },
});
