import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FOOTBALL_HISTORY_VARIATIONS, type FootballHistoryVariationKey } from "../data/supabaseFootballTrial";
import { FootballPriceGapHistory } from "./FootballPriceGapHistory";
import { PredictionFormatTabs, PredictionModelTabs, PredictionTypeTabs, type PredictionFormat } from "./PredictionControls";

// Apply the shared football league scope to one selected historical model without proxying another league.
export function FootballPredictionHistoryScreen({ league }: { league: string | null }) {
  const [format, setFormat] = useState<PredictionFormat>("singles");
  const [variationKey, setVariationKey] = useState<FootballHistoryVariationKey>("gap_exact");
  const variation = FOOTBALL_HISTORY_VARIATIONS.find((item) => item.key === variationKey) ?? FOOTBALL_HISTORY_VARIATIONS[0];
  return <View style={styles.section}>
    <Text style={styles.eyebrow}>Prediction History</Text>
    <Text style={styles.heading}>Stored prediction outcomes</Text>
    <Text style={styles.note}>Review historical backtests and recorded forecasts for the selected football leagues.</Text>
    <PredictionFormatTabs activeFormat={format} onChange={setFormat} />
    <PredictionTypeTabs activeType="win_percentage" onChange={() => undefined}
      options={[{ label: "Win %", value: "win_percentage", description: "Probability-based fixed-win models." }]} />
    {format === "singles" ? <>
      <PredictionModelTabs activeModelKey={variationKey} models={FOOTBALL_HISTORY_VARIATIONS} onChange={setVariationKey} />
      <View style={styles.modelInfo}>
        <Text style={styles.modelTitle}>{variation.label}</Text>
        <Text style={styles.note}>{variation.description}</Text>
        <Text style={styles.note}>{variation.detail}</Text>
      </View>
      <FootballPriceGapHistory league={league} variation={variation} />
    </> : <Text style={styles.note}>No football multi prediction history is available yet. Choose Singles to review individual match predictions.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: "#fff", borderColor: "#d7dce7", borderWidth: 1, borderRadius: 8, padding: 16, gap: 12 },
  eyebrow: { color: "#667085", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  heading: { color: "#18202f", fontSize: 20, fontWeight: "900" },
  note: { color: "#667085", fontSize: 13, lineHeight: 19 },
  modelInfo: { backgroundColor: "#f8fafc", borderColor: "#e4e7ec", borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  modelTitle: { color: "#18202f", fontSize: 14, fontWeight: "900" },
});
