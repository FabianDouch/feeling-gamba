import { StyleSheet, Text, View } from "react-native";
import { getUnavailableScopeMessage, type SportScope } from "../navigation/sportLeagueScope";

// Keep unsupported scopes explicit rather than displaying another sport's models or data.
export function UnavailableSportScope({ scope, view }: { scope: SportScope; view: "insights" | "predictions" | "history" }) {
  return <View style={styles.card}>
    <Text style={styles.title}>{view === "history" ? "Prediction History" : view === "predictions" ? "Predictions" : "Insights"}</Text>
    <Text style={styles.note}>{getUnavailableScopeMessage(scope, view)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderColor: "#d7dce7", borderWidth: 1, borderRadius: 8, padding: 16, gap: 8 },
  title: { color: "#18202f", fontSize: 18, fontWeight: "800" }, note: { color: "#667085", fontSize: 13, lineHeight: 19 },
});
