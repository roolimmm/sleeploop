import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const PROFILE_KEY = "sleepBehaviouralProfile";

type PatternStatus = "detected" | "not_detected" | "insufficient_data";

type SleepBehaviouralProfile = {
  generatedAt: string;
  sleepHistory: {
    numberOfNights: number;
    averageSleepHours: number;
    medianSleepHours: number;
    shortestSleepHours: number;
    longestSleepHours: number;
  };
  patterns: {
    delayedSleepOnset: {
      status: PatternStatus;
      percentageDelayed: number;
      averageDelayMinutes: number;
    };
    insufficientSleep: {
      status: PatternStatus;
      percentageInsufficient: number;
      averageInsufficientHours: number;
    };
  };
};

function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function patternDescription(status: PatternStatus, kind: "delay" | "short"): string {
  if (status === "insufficient_data") {
    return "More recorded nights are needed before this pattern can be assessed.";
  }
  if (status === "detected") {
    return kind === "delay"
      ? "Later-than-planned sleep onset has occurred repeatedly in your recorded nights."
      : "Sleep durations below seven hours have occurred repeatedly in your recorded nights.";
  }
  return kind === "delay"
    ? "Later-than-planned sleep onset has not met the recurring-pattern threshold."
    : "Sleep durations below seven hours have not met the recurring-pattern threshold.";
}

export default function Insights() {
  const [profile, setProfile] = useState<SleepBehaviouralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await AsyncStorage.getItem(PROFILE_KEY);
      setProfile(stored ? (JSON.parse(stored) as SleepBehaviouralProfile) : null);
    } catch (err) {
      console.error("Unable to load sleep insights:", err);
      setProfile(null);
      setError("Unable to load your sleep insights. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when returning to this tab, including after refreshing Home.
  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const delay = profile?.patterns.delayedSleepOnset;
  const insufficient = profile?.patterns.insufficientSleep;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Sleep Insights</Text>
      <Text style={styles.subtitle}>
        A closer look at your recorded sleep habits.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#426B52" />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void loadProfile()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !profile ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No insights yet</Text>
          <Text style={styles.body}>
            Open Home and refresh your sleep data to generate your first insights.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SLEEP OVERVIEW</Text>
            <Text style={styles.metric}>{formatHours(profile.sleepHistory.averageSleepHours)}</Text>
            <Text style={styles.metricCaption}>Average sleep per recorded night</Text>
            <View style={styles.divider} />
            <Text style={styles.body}>
              Based on {profile.sleepHistory.numberOfNights} recorded {profile.sleepHistory.numberOfNights === 1 ? "night" : "nights"}.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>DELAYED SLEEP ONSET</Text>
            <Text style={styles.metric}>
              {delay?.status === "insufficient_data" ? "Not enough data" : formatPercent(delay?.percentageDelayed ?? 0)}
            </Text>
            {delay?.status !== "insufficient_data" && (
              <Text style={styles.metricCaption}>Of nights with a matched bedtime plan</Text>
            )}
            <Text style={styles.body}>{delay && patternDescription(delay.status, "delay")}</Text>
            {delay?.status !== "insufficient_data" && (delay?.percentageDelayed ?? 0) > 0 && (
              <Text style={styles.detail}>
                Average delay on delayed nights: {Math.round(delay?.averageDelayMinutes ?? 0)} min
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>INSUFFICIENT SLEEP</Text>
            <Text style={styles.metric}>
              {insufficient?.status === "insufficient_data" ? "Not enough data" : formatPercent(insufficient?.percentageInsufficient ?? 0)}
            </Text>
            {insufficient?.status !== "insufficient_data" && (
              <Text style={styles.metricCaption}>Of recorded nights below 7 hours</Text>
            )}
            <Text style={styles.body}>{insufficient && patternDescription(insufficient.status, "short")}</Text>
            {insufficient?.status !== "insufficient_data" && (insufficient?.percentageInsufficient ?? 0) > 0 && (
              <Text style={styles.detail}>
                Average duration on shorter nights: {formatHours(insufficient?.averageInsufficientHours ?? 0)}
              </Text>
            )}
          </View>

          <Text style={styles.footnote}>
            Insights describe trends in available records, not medical diagnoses. A delayed sleep onset does not necessarily mean bedtime procrastination.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F2EA" },
  content: { paddingHorizontal: 24, paddingTop: 80, paddingBottom: 56 },
  heading: { fontSize: 36, fontWeight: "700", color: "#263D31" },
  subtitle: { fontSize: 14, color: "#69756C", marginTop: 8, marginBottom: 32 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, marginBottom: 18 },
  cardLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: "#69756C" },
  cardTitle: { fontSize: 19, fontWeight: "700", color: "#263D31", marginBottom: 10 },
  metric: { fontSize: 32, fontWeight: "700", color: "#263D31", marginTop: 16 },
  metricCaption: { fontSize: 13, color: "#69756C", marginTop: 5 },
  body: { fontSize: 14, lineHeight: 21, color: "#4E6255", marginTop: 14 },
  detail: { fontSize: 13, lineHeight: 20, color: "#426B52", marginTop: 12, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#E5ECE3", marginTop: 18 },
  footnote: { fontSize: 12, lineHeight: 19, color: "#69756C", marginTop: 4 },
  loader: { marginVertical: 36 },
  retryButton: { backgroundColor: "#426B52", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 18 },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
});
