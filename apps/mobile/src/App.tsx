import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { hasSupabaseClientConfig } from "./config/env";
import { AuthProvider, useAuth } from "./data/authSession";
import { AccountScreen } from "./screens/AccountScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { PredictionsScreen } from "./screens/PredictionsScreen";
import { RaceDaysScreen } from "./screens/RaceDaysScreen";
import { RecommendationsScreen } from "./screens/RecommendationsScreen";

type AppPage = "account" | "insights" | "predictions" | "recommendations" | "raceDays";

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const [activePage, setActivePage] = useState<AppPage>("insights");
  const [recommendationsRefreshSignal, setRecommendationsRefreshSignal] = useState(0);
  const { user } = useAuth();

  /**
   * Opens the Promos tab and asks it to re-check the Supabase cache.
   */
  function openRecommendationsPage() {
    setActivePage("recommendations");
    setRecommendationsRefreshSignal((current) => current + 1);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.appHeader}>
            <View>
              <Text style={styles.appName}>Feeling Gamba</Text>
              <Text style={styles.appSubhead}>
                Favourite performance and race-result logging
              </Text>
            </View>
            <View
              style={[
                styles.connectionPill,
                hasSupabaseClientConfig
                  ? styles.connectionReady
                  : styles.connectionMissing,
              ]}
            >
              <Text
                style={[
                  styles.connectionText,
                  hasSupabaseClientConfig
                    ? styles.connectionTextReady
                    : styles.connectionTextMissing,
                ]}
              >
                {user ? "Signed in" : hasSupabaseClientConfig ? "Supabase ready" : "Env pending"}
              </Text>
            </View>
          </View>

          <View style={styles.pageNav}>
            <PageNavButton
              active={activePage === "insights"}
              label="Insights"
              onPress={() => setActivePage("insights")}
            />
            <PageNavButton
              active={activePage === "recommendations"}
              label="Promos"
              onPress={openRecommendationsPage}
            />
            <PageNavButton
              active={activePage === "predictions"}
              label="Predictions"
              onPress={() => setActivePage("predictions")}
            />
            <PageNavButton
              active={activePage === "raceDays"}
              label="Race Days"
              onPress={() => setActivePage("raceDays")}
            />
            <PageNavButton
              active={activePage === "account"}
              label="Account"
              onPress={() => setActivePage("account")}
            />
          </View>

          {activePage === "insights" ? (
            <InsightsScreen />
          ) : activePage === "recommendations" ? (
            <RecommendationsScreen refreshSignal={recommendationsRefreshSignal} />
          ) : activePage === "predictions" ? (
            <PredictionsScreen />
          ) : activePage === "account" ? (
            <AccountScreen />
          ) : (
            <RaceDaysScreen />
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type PageNavButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function PageNavButton({ active, label, onPress }: PageNavButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pageNavButton, active ? styles.pageNavButtonActive : null]}
    >
      <Text style={[styles.pageNavText, active ? styles.pageNavTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  appHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  appName: {
    color: "#101828",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
  },
  appSubhead: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 280,
  },
  connectionMissing: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  connectionPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  connectionReady: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  connectionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  connectionTextMissing: {
    color: "#9a3412",
  },
  connectionTextReady: {
    color: "#067647",
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 40,
  },
  pageNav: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 6,
  },
  pageNavButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pageNavButtonActive: {
    backgroundColor: "#18202f",
  },
  pageNavText: {
    color: "#475467",
    fontSize: 14,
    fontWeight: "800",
  },
  pageNavTextActive: {
    color: "#ffffff",
  },
  safeArea: {
    backgroundColor: "#f7f8fb",
    flex: 1,
  },
});
