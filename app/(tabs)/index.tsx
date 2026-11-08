import * as HealthKit from "@appeeky/expo-healthkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import BedtimeModal from "../../components/BedtimeModal";
import { generateBehaviouralProfile } from "../../utils/behaviouralProfile";
import {
  analyseBedtimeDelays,
  detectRecurringBedtimeDelay,
  detectRecurringInsufficientSleep,
  type BedtimePlan,
} from "../../utils/patternDetection";
import { processSleepData } from "../../utils/sleepProcessing";

const BEDTIME_PLANS_KEY = "bedtimePlans";

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatBedtime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return time;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

// Early-morning hours (before 12 PM) are treated as part of the
// previous evening's bedtime-planning window.
function currentBedtimeNightKey(now = new Date()): string {
  const date = new Date(now);
  if (date.getHours() < 12) date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

export default function Index() {
  const [totalSleep, setTotalSleep] = useState<string | null>(null);
  const [lastNightDate, setLastNightDate] = useState<string | null>(null);
  const [plannedBedtime, setPlannedBedtime] = useState<string | null>(null);
  const [showBedtimeModal, setShowBedtimeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshPlannedBedtime = useCallback(async () => {
    const stored = await AsyncStorage.getItem(BEDTIME_PLANS_KEY);
    const plans: BedtimePlan[] = stored ? JSON.parse(stored) : [];
    const nightKey = currentBedtimeNightKey();
    const plan = plans.find((item) => item.nightDate === nightKey);
    setPlannedBedtime(plan?.plannedBedtime ?? null);
  }, []);

  const runSleepAnalysis = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await HealthKit.requestAuthorization({
        toRead: [HealthKit.CategoryType.sleepAnalysis],
        toShare: [],
      });

      // Historical testing range retained from the existing implementation.
      const startDate = new Date(2026, 9, 4);
      const endDate = new Date(2026, 9, 19, 12);
      const samples = await HealthKit.queryCategorySamples({
        type: HealthKit.CategoryType.sleepAnalysis,
        from: startDate,
        to: endDate,
        ascending: true,
      });
      const { nightlyRecords, summary } = processSleepData(samples);
      const stored = await AsyncStorage.getItem(BEDTIME_PLANS_KEY);
      const plans: BedtimePlan[] = stored ? JSON.parse(stored) : [];
      const bedtimeDelays = analyseBedtimeDelays(plans, nightlyRecords);
      const bedtimePattern = detectRecurringBedtimeDelay(bedtimeDelays);
      const insufficientPattern = detectRecurringInsufficientSleep(nightlyRecords);
      const profile = generateBehaviouralProfile(
        summary,
        bedtimePattern,
        insufficientPattern
      );

      if (profile) {
        await AsyncStorage.setItem("sleepBehaviouralProfile", JSON.stringify(profile));
      } else {
        await AsyncStorage.removeItem("sleepBehaviouralProfile");
      }

      const latestNight = [...nightlyRecords]
        .sort((a, b) => a.nightDate.localeCompare(b.nightDate))
        .at(-1);
      setTotalSleep(latestNight ? formatDuration(latestNight.totalSleepMinutes) : null);
      setLastNightDate(latestNight?.nightDate ?? null);
      await refreshPlannedBedtime();

      console.log("========== SleepLoop Behavioural Learning ==========");
      console.log("Processed nights:", nightlyRecords.length);
      console.log("Delayed sleep onset:", JSON.stringify(bedtimePattern, null, 2));
      console.log("Insufficient sleep:", JSON.stringify(insufficientPattern, null, 2));
      console.log("Behavioural profile:", JSON.stringify(profile, null, 2));
    } catch (error) {
      console.error("SleepLoop analysis error:", error);
      setErrorMessage("Unable to load sleep data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [refreshPlannedBedtime]);

  useEffect(() => {
    void runSleepAnalysis();
  }, [runSleepAnalysis]);

  const handleModalClose = async () => {
    setShowBedtimeModal(false);
    try {
      await refreshPlannedBedtime();
      // The modal persists plans in AsyncStorage. Refresh the Home card.
      // Historical analysis is refreshed using the button below.
    } catch (error) {
      console.error("Unable to refresh bedtime plan:", error);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>{getGreeting()}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>LATEST AVAILABLE SLEEP RECORD</Text>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <Text style={styles.sleepDuration}>{totalSleep ?? "No sleep data"}</Text>
        )}
        <Text style={styles.helperText}>
          {lastNightDate
            ? `Recorded night: ${lastNightDate}`
            : "Your most recent recorded sleep duration will appear here."}
        </Text>
      </View>

      <View style={styles.bedtimeCard}>
        <Text style={styles.cardLabel}>TONIGHT'S BEDTIME</Text>
        <Text style={styles.bedtimeValue}>
          {plannedBedtime ? formatBedtime(plannedBedtime) : "Not sure yet"}
        </Text>
        {!plannedBedtime && (
          <Text style={styles.helperText}>
            Choose when you'd like to go to bed tonight.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => setShowBedtimeModal(true)}
        >
          <Text style={styles.primaryButtonText}>
            {plannedBedtime ? "Change bedtime" : "Set planned bedtime"}
          </Text>
        </Pressable>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Pressable
        accessibilityRole="button"
        style={styles.refreshButton}
        onPress={() => void runSleepAnalysis()}
        disabled={loading}
      >
        <Text style={styles.refreshText}>
          {loading ? "Refreshing…" : "Refresh sleep data"}
        </Text>
      </Pressable>

      <BedtimeModal
        visible={showBedtimeModal}
        onClose={() => void handleModalClose()}
      />
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F2EA",
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 56,
  },

  greeting: {
    fontSize: 36,
    fontWeight: "700",
    color: "#263D31",
    marginTop: 12,
    marginBottom: 40,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 18,
  },

  bedtimeCard: {
    backgroundColor: "#E5ECE3",
    borderRadius: 20,
    padding: 24,
  },

  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#69756C",
  },

  sleepDuration: {
    fontSize: 35,
    fontWeight: "700",
    color: "#263D31",
    marginTop: 12,
  },

  bedtimeValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#263D31",
    marginTop: 16,
  },

  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#68756C",
    marginTop: 9,
  },

  loader: {
    marginVertical: 18,
  },

  primaryButton: {
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "#426B52",
    alignItems: "center",
  },

  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  refreshButton: {
    alignItems: "center",
    paddingVertical: 18,
    marginTop: 12,
  },

  refreshText: {
    color: "#426B52",
    fontWeight: "600",
  },

  error: {
    color: "#9B3030",
    fontSize: 13,
    marginTop: 14,
  },
});
