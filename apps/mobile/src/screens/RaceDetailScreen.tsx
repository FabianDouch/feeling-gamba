import { StyleSheet, Text, View } from "react-native";

import { selectedRaceDetail } from "../data/collectedRaceDay";

export function RaceDetailScreen() {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Race detail</Text>
      <Text style={styles.heading}>
        R{selectedRaceDetail.raceNumber} {selectedRaceDetail.track}
      </Text>
      <Text style={styles.raceName}>{selectedRaceDetail.raceName}</Text>

      <View style={styles.grid}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Favourite</Text>
          <Text style={styles.metricValue}>{selectedRaceDetail.favourite}</Text>
          <Text style={styles.metricNote}>
            Finished {selectedRaceDetail.favouriteFinish}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>MarketMover</Text>
          <Text style={styles.metricValue}>{selectedRaceDetail.marketMover}</Text>
          <Text style={styles.metricNote}>Explicit source flag</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Winner</Text>
          <Text style={styles.metricValue}>{selectedRaceDetail.winner}</Text>
          <Text style={styles.metricNote}>
            {selectedRaceDetail.winnerDividend} win dividend
          </Text>
        </View>
      </View>

      <Text style={styles.subheading}>
        Runners · {selectedRaceDetail.starters} starters · {selectedRaceDetail.distance}
      </Text>
      {selectedRaceDetail.runners.map((runner) => (
        <View key={`${runner.number}-${runner.name}`} style={styles.runnerRow}>
          <View style={styles.runnerNumber}>
            <Text style={styles.runnerNumberText}>{runner.number}</Text>
          </View>
          <View style={styles.runnerContent}>
            <Text style={styles.runnerName}>{runner.name}</Text>
            <Text style={styles.runnerMeta}>
              Fixed {runner.fixedWinPrice} · Result {runner.result} · Win{" "}
              {runner.winDividend}
            </Text>
          </View>
          <View style={styles.runnerTags}>
            {runner.isFavourite ? <Text style={styles.tag}>Fav</Text> : null}
            {runner.isMarketMover ? <Text style={styles.tag}>MM</Text> : null}
            {runner.scratched ? <Text style={styles.scratchedTag}>Scr</Text> : null}
          </View>
        </View>
      ))}

      <View style={styles.sourceBox}>
        <Text style={styles.sourceTitle}>Source status</Text>
        <Text style={styles.sourceText}>
          {selectedRaceDetail.sourceStatus} Missing favourite, result, starter
          count, or dividend data is shown explicitly instead of being inferred.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  grid: {
    gap: 10,
    marginTop: 14,
  },
  heading: {
    color: "#18202f",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
  },
  raceName: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  metric: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  metricLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  metricNote: {
    color: "#667085",
    fontSize: 12,
    marginTop: 2,
  },
  metricValue: {
    color: "#18202f",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  runnerContent: {
    flex: 1,
  },
  runnerMeta: {
    color: "#667085",
    fontSize: 12,
    marginTop: 2,
  },
  runnerName: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "800",
  },
  runnerNumber: {
    alignItems: "center",
    backgroundColor: "#f2f4f7",
    borderRadius: 6,
    height: 32,
    justifyContent: "center",
    width: 34,
  },
  runnerNumberText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  runnerRow: {
    alignItems: "center",
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  runnerTags: {
    alignItems: "flex-end",
    gap: 4,
    minWidth: 34,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  scratchedTag: {
    backgroundColor: "#fef3f2",
    borderColor: "#fecdca",
    borderRadius: 5,
    borderWidth: 1,
    color: "#b42318",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  sourceBox: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  sourceText: {
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  sourceTitle: {
    color: "#9a3412",
    fontSize: 13,
    fontWeight: "800",
  },
  subheading: {
    color: "#18202f",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 16,
  },
  tag: {
    backgroundColor: "#e7f5f2",
    borderColor: "#9ad0c9",
    borderRadius: 5,
    borderWidth: 1,
    color: "#0f5f58",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
});
