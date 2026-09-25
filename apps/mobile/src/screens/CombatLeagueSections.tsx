import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// Keep combat leagues and their models separate while making both visible in the all-sport scope.
export function CombatLeagueSections({ renderLeague, onSelectLeague }: {
  renderLeague: (league: "ufc" | "pfl") => ReactNode; onSelectLeague: (league: string) => void;
}) {
  return <View style={styles.sections}>
    <Text style={styles.note}>UFC and PFL are shown separately. Scores, history totals and same-card multis retain their league scope.</Text>
    {(["ufc", "pfl"] as const).map((league) => <View key={league} testID={`combat-section-${league}`} style={styles.sections}>
      <View style={styles.header}><Text style={styles.heading}>{league.toUpperCase()}</Text>
        <Pressable accessibilityRole="button" onPress={() => onSelectLeague(league)} style={styles.button}><Text style={styles.link}>Open {league.toUpperCase()}</Text></Pressable>
      </View>
      {renderLeague(league)}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  sections: { gap: 12 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: "#18202f", fontSize: 20, fontWeight: "900" }, note: { color: "#667085", fontSize: 13, lineHeight: 19 },
  button: { borderColor: "#d7dce7", borderWidth: 1, borderRadius: 6, padding: 10 }, link: { color: "#175cd3", fontSize: 12, fontWeight: "700" },
});
