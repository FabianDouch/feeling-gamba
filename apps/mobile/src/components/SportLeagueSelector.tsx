import { Pressable, StyleSheet, Text, View } from "react-native";
import { getSportScope, LEAGUE_OPTIONS, SPORT_OPTIONS, selectLeagueScope, selectSportGroup, type SportScopeState } from "../navigation/sportLeagueScope";

type Props = { state: SportScopeState; onChange: (update: (state: SportScopeState) => SportScopeState) => void };

// Give Insights and both prediction views the same labelled sport and league navigation.
export function SportLeagueSelector({ state, onChange }: Props) {
  const scope = getSportScope(state);
  return <View style={styles.card}>
    <ScopeRow label="Sport" options={SPORT_OPTIONS} selected={scope.group}
      onChange={(value) => onChange((current) => selectSportGroup(current, value))} />
    <ScopeRow label="League" options={LEAGUE_OPTIONS[scope.group]} selected={scope.league}
      onChange={(value) => onChange((current) => selectLeagueScope(current, value))} />
  </View>;
}

// Keep selected scope accessible on web and native, including single-option league rows.
function ScopeRow({ label, options, selected, onChange }: {
  label: string; options: readonly { label: string; value: string }[]; selected: string; onChange: (value: string) => void;
}) {
  return <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.options} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => <Pressable key={option.value} accessibilityRole="tab"
        accessibilityState={{ selected: selected === option.value }} aria-selected={selected === option.value}
        onPress={() => onChange(option.value)} style={[styles.option, selected === option.value && styles.active]}>
        <Text style={[styles.optionText, selected === option.value && styles.activeText]}>{option.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderColor: "#d7dce7", borderWidth: 1, borderRadius: 8, padding: 16, gap: 14 },
  row: { gap: 8 }, label: { color: "#344054", fontSize: 12, fontWeight: "800" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { borderColor: "#d7dce7", borderWidth: 1, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
  active: { backgroundColor: "#18202f", borderColor: "#18202f" },
  optionText: { color: "#475467", fontSize: 13, fontWeight: "800" }, activeText: { color: "#fff" },
});
