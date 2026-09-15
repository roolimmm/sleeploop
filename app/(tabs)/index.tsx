import { Text, View, StyleSheet } from "react-native";

export default function Index() {
  // Temporary data for UI testing.
  // Later, these values will come from sleepProcessing.ts / HealthKit.
  const lastNight = {
    duration: "6 h 17 min",
    sleepOnset: "12:12 AM",
    wakeTime: "6:28 AM",
  };

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Good morning!</Text>

      <Text style={styles.sectionTitle}>LAST NIGHT</Text>

      <View style={styles.card}>
        <Text style={styles.duration}>{lastNight.duration}</Text>
        <Text style={styles.durationLabel}>Total Sleep</Text>

        <View style={styles.divider} />

        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.time}>{lastNight.sleepOnset}</Text>
            <Text style={styles.timeLabel}>Fell asleep</Text>
          </View>

          <View style={styles.timeBlock}>
            <Text style={styles.time}>{lastNight.wakeTime}</Text>
            <Text style={styles.timeLabel}>Woke up</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eae7e2",
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
    backgroundColor: "#ffffff",
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