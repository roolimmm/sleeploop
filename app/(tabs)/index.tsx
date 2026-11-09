
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

import { generateBehaviouralProfile } from "../../utils/behaviouralProfile";

import {
  detectIrregularSleep,
  detectRecurringInsufficientSleep,
} from "../../utils/patternDetection";

import { processSleepData } from "../../utils/sleepProcessing";

import {
  formatPredictedTime,
  predictUpcomingSleep,
} from "../../utils/sleepPrediction";

const BEHAVIOURAL_PROFILE_KEY = "sleepBehaviouralProfile";

function formatDuration(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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
  const [totalSleep, setTotalSleep] = useState<string | null>(
    null
  );

  const [lastNightDate, setLastNightDate] = useState<
    string | null
  >(null);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  const runSleepAnalysis = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Request HealthKit read permission
      await HealthKit.requestAuthorization({
        toRead: [HealthKit.CategoryType.sleepAnalysis],
        toShare: [],
      });

      // Retrieve all available sleep records
      // from 1 June 2026 onwards
      const startDate = new Date(2026, 5, 1);
      const endDate = new Date();

      const samples = await HealthKit.queryCategorySamples({
        type: HealthKit.CategoryType.sleepAnalysis,
        from: startDate,
        to: endDate,
        ascending: true,
      });

      // PROCESS SLEEP DATA
      const { nightlyRecords, summary } = processSleepData(samples);

      // ===============================================
      // RIDGE REGRESSION: TEST OCTOBER 20 PREDICTION
      // ===============================================

      // The evening date of the sleep period we want to predict.
      const targetNightDate = "2026-10-20";

      // Predict using only sleep records before October 19.
      // sleepPrediction.ts handles the historical filtering.
      const predictionResult = predictUpcomingSleep(
        nightlyRecords,
        targetNightDate
      );

      console.log("========== SleepLoop Sleep Prediction ==========");
      console.log("Target night:", targetNightDate);
      console.log("Prediction status:", predictionResult.status);

      if (predictionResult.status === "ready") {
        const prediction = predictionResult.prediction;

      console.log(
        "Predicted sleep onset:",
        formatPredictedTime(prediction.predictedOnsetMinutes)
      );

      console.log(
        "Predicted wake time:",
        formatPredictedTime(prediction.predictedWakeMinutes)
      );

      console.log(
        "Predicted sleep duration:",
        formatDuration(prediction.predictedDurationMinutes)
      );

      console.log(
        "Training examples:",
        prediction.trainingExamples
      );

      console.log(
        "Days since last record:",
        prediction.daysSinceLastRecord
      );

      console.log(
        "Baseline sleep onset:",
        formatPredictedTime(prediction.baselineOnsetMinutes)
      );

      console.log(
       "Baseline wake time:",
       formatPredictedTime(prediction.baselineWakeMinutes)
      );
      
      } else {
        console.log(
          "Prediction unavailable:",
          predictionResult.reason
        );
      }
      
      // Temporary: automatically export sleep data for ML training
      //try {
      //  await exportSleepCSV(nightlyRecords);
      //} catch (error) {
      //  console.error("Failed to export sleep CSV:", error);
      //}

      // DETECT BEHAVIOURAL PATTERNS
      // Pattern 1: Recurring insufficient sleep
      const insufficientPattern =
        detectRecurringInsufficientSleep(nightlyRecords);

      // Pattern 2: Irregular sleep timing
      const irregularPattern =
        detectIrregularSleep(nightlyRecords);

      // GENERATE BEHAVIOURAL PROFILE
      const profile = generateBehaviouralProfile(
        summary,
        insufficientPattern,
        irregularPattern
      );

      // Store the latest behavioural profile
      if (profile) {
        await AsyncStorage.setItem(
          BEHAVIOURAL_PROFILE_KEY,
          JSON.stringify(profile)
        );
      } else {
        await AsyncStorage.removeItem(
          BEHAVIOURAL_PROFILE_KEY
        );
      }

      // UPDATE LATEST SLEEP RECORD
      const latestNight = [...nightlyRecords]
        .sort((a, b) =>
          a.nightDate.localeCompare(b.nightDate)
        )
        .at(-1);

      setTotalSleep(
        latestNight
          ? formatDuration(latestNight.totalSleepMinutes)
          : null
      );

      setLastNightDate(latestNight?.nightDate ?? null);

      // DEBUG LOGS
      console.log(
        "========== SleepLoop Behavioural Learning =========="
      );

      console.log(
        "HealthKit samples:",
        samples.length
      );

      console.log(
        "Processed nights:",
        nightlyRecords.length
      );

      console.log(
        "Insufficient sleep:",
        JSON.stringify(insufficientPattern, null, 2)
      );

      console.log(
        "Irregular sleep:",
        JSON.stringify(irregularPattern, null, 2)
      );

      console.log(
        "Behavioural profile:",
        JSON.stringify(profile, null, 2)
      );

    } catch (error) {
      console.error(
        "SleepLoop analysis error:",
        error
      );

      setErrorMessage(
        "Unable to load sleep data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // INITIAL DATA LOADING
  useEffect(() => {
    void runSleepAnalysis();
  }, [runSleepAnalysis]);

  // ==================================================
  // HOME SCREEN UI
  // ==================================================
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.greeting}>
        {getGreeting()}
      </Text>

      {/* Latest available sleep record */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          LATEST AVAILABLE SLEEP RECORD
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <Text style={styles.sleepDuration}>
            {totalSleep ?? "No sleep data"}
          </Text>
        )}

        <Text style={styles.helperText}>
          {lastNightDate
            ? `Recorded night: ${lastNightDate}`
            : "Your most recent recorded sleep duration will appear here."}
        </Text>
      </View>

      {/* Error message */}
      {errorMessage && (
        <Text style={styles.error}>
          {errorMessage}
        </Text>
      )}

      {/* Refresh HealthKit data */}
      <Pressable
        accessibilityRole="button"
        style={styles.refreshButton}
        onPress={() => void runSleepAnalysis()}
        disabled={loading}
      >
        <Text style={styles.refreshText}>
          {loading
            ? "Refreshing…"
            : "Refresh sleep data"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ==================================================
// STYLES
// ==================================================
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

  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#68756C",
    marginTop: 9,
  },

  loader: {
    marginVertical: 18,
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
