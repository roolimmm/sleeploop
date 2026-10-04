import * as HealthKit from "@appeeky/expo-healthkit";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { processSleepData } from "../../utils/sleepProcessing";

export default function Index() {
  const [totalSleep, setTotalSleep] = useState<string | null>(null);
  const requestHealthKitPermission = async () => {
    try {
      await HealthKit.requestAuthorization({
        toRead: [HealthKit.CategoryType.sleepAnalysis],
        toShare: [],
      });
      
      console.log("HealthKit permission requested successfully");

      const startDate = new Date("2026-09-15T00:00:00");
      const endDate = new Date("2026-09-17T00:00:00");
      
      const samples = await HealthKit.queryCategorySamples({
        type: HealthKit.CategoryType.sleepAnalysis,
        from: startDate,
        to: endDate,
        ascending: true,
      });
      
      console.log("Number of raw sleep samples:", samples.length);
      
      const processed = processSleepData(samples);
      
      console.log(
        "Number of processed nights:",
        processed.nightlyRecords.length
      );
      
      console.log(
        "Nightly records:",
        processed.nightlyRecords
      );

      if (processed.nightlyRecords.length > 0) {
      const latestNight =   processed.nightlyRecords[processed.nightlyRecords.length - 1];
      const hours = Math.floor(latestNight.totalSleepMinutes / 60);
      const minutes = Math.round(latestNight.totalSleepMinutes % 60);
      setTotalSleep(`${hours} h ${minutes} min`);
    }
  } catch (error) {
    console.log("HealthKit error:", error);
   }
  };

  useEffect(() => {
    requestHealthKitPermission();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Good morning!</Text>
      
      <Text style={styles.sectionTitle}>LAST NIGHT</Text>

      <View style={styles.card}>
        <Text style={styles.duration}>
          {totalSleep ?? "--"}
        </Text>
        <Text style={styles.durationLabel}>Total Sleep</Text>
        <View style={styles.divider} />
      </View>
    </View>
  );  
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d7a348",
    paddingHorizontal: 24,
    paddingTop: 70,
  },

  greeting: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 32,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
  },

  card: {
    backgroundColor: "#c5cfda",
    borderRadius: 18,
    padding: 24,
  },

  duration: {
    fontSize: 34,
    fontWeight: "bold",
    textAlign: "center",
  },

  durationLabel: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 5,
  },

  divider: {
    height: 1,
    backgroundColor: "#d5d5d5",
    marginVertical: 24,
  },

  timeRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },

  timeBlock: {
    alignItems: "center",
  },

  time: {
    fontSize: 20,
    fontWeight: "bold",
  },

  timeLabel: {
    fontSize: 13,
    marginTop: 5,
  },
});