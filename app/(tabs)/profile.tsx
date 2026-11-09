
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

  sleepSchedule: {
    typicalSleepOnset: string;
    typicalWakeTime: string;
    sleepOnsetVariabilityMinutes: number;
    wakeTimeVariabilityMinutes: number;
  };

  patterns: {
    insufficientSleep: {
      status: PatternStatus;
      percentageInsufficient: number;
      averageInsufficientHours: number | null;
    };

    irregularSleep: {
      status: PatternStatus;
      irregularSleepOnset: boolean;
      irregularWakeTime: boolean;
      sleepOnsetVariabilityMinutes: number;
      wakeTimeVariabilityMinutes: number;
    };
  };

  detectedPatterns: string[];
  detectedPatternCount: number;
};

// ---------------------------------------------
// Formatting
// ---------------------------------------------

function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return `${h} h ${String(m).padStart(2, "0")} min`;
}

// ---------------------------------------------
// Personalised sleep routine interpretation
// ---------------------------------------------

function getSleepRoutineMessage(
  profile: SleepBehaviouralProfile
): string {
  const insufficient = profile.patterns.insufficientSleep;
  const irregular = profile.patterns.irregularSleep;

  if (
    insufficient.status === "insufficient_data" ||
    irregular.status === "insufficient_data"
  ) {
    return "We're still learning about your sleep. More recorded nights will help us understand your routine.";
  }

  const onsetIrregular = irregular.irregularSleepOnset;
  const wakeIrregular = irregular.irregularWakeTime;
  const insufficientDetected =
    insufficient.status === "detected";

  if (onsetIrregular && wakeIrregular && insufficientDetected) {
    return "Your sleep and wake times vary, and shorter nights occur frequently. We'll continue learning your routine to help identify where additional rest may be needed.";
  }

  if (onsetIrregular && wakeIrregular) {
    return "Your sleep and wake times vary across recorded nights. Different daily routines may contribute to these changes.";
  }

  if (wakeIrregular && insufficientDetected) {
    return "Your sleep-onset timing is relatively consistent, but your wake times vary. Some shorter nights may be worth paying attention to.";
  }

  if (wakeIrregular) {
    return "Your sleep-onset timing has been relatively consistent, while your wake times vary more. Different daily routines may contribute to this variation.";
  }

  if (onsetIrregular && insufficientDetected) {
    return "Your sleep-onset timing varies, and shorter nights occur frequently. A more consistent evening routine may help support sufficient sleep.";
  }

  if (onsetIrregular) {
    return "Your wake times have been relatively consistent, while your sleep-onset timing varies more across recorded nights.";
  }

  if (insufficientDetected) {
    return "Your sleep timing has been relatively consistent, but shorter nights occur frequently. Getting enough sleep may be an area to focus on.";
  }

  return "Your sleep and wake times have been relatively consistent across recorded nights. Keep building on the routine that works for you.";
}

// ---------------------------------------------
// Profile screen
// ---------------------------------------------

export default function Profile() {
  const [profile, setProfile] =
    useState<SleepBehaviouralProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const stored = await AsyncStorage.getItem(PROFILE_KEY);

      setProfile(
        stored
          ? (JSON.parse(stored) as SleepBehaviouralProfile)
          : null
      );
    } catch (err) {
      console.error("Unable to load sleep profile:", err);

      setProfile(null);
      setError("Unable to load your sleep profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the user returns to this tab.
  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const insufficient = profile?.patterns?.insufficientSleep;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.heading}>Your sleep</Text>

      <Text style={styles.subtitle}>
        A little more about your sleep habits.
      </Text>

      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          color="#426B52"
        />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.body}>{error}</Text>

          <Pressable
            onPress={() => void loadProfile()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !profile ||
        !profile.sleepSchedule ||
        !profile.patterns?.irregularSleep ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            No sleep profile yet
          </Text>

          <Text style={styles.body}>
            Open Home and refresh your sleep data to
            generate your sleep profile.
          </Text>
        </View>
      ) : (
        <>
          {/* Sleep profile */}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              YOUR SLEEP PROFILE
            </Text>

            <Text style={styles.metric}>
              {formatHours(
                profile.sleepHistory.averageSleepHours
              )}
            </Text>

            <Text style={styles.metricCaption}>
              Average sleep across{" "}
              {profile.sleepHistory.numberOfNights} recorded{" "}
              {profile.sleepHistory.numberOfNights === 1
                ? "night"
                : "nights"}
            </Text>

            <View style={styles.divider} />

            {/* Typical sleep schedule */}

            <View style={styles.scheduleRow}>
              <View style={styles.scheduleItem}>
                <Text style={styles.scheduleLabel}>
                  Usually asleep by
                </Text>

                <Text style={styles.scheduleValue}>
                  {profile.sleepSchedule.typicalSleepOnset}
                </Text>
              </View>

              <View style={styles.scheduleItem}>
                <Text style={styles.scheduleLabel}>
                  Usually awake by
                </Text>

                <Text style={styles.scheduleValue}>
                  {profile.sleepSchedule.typicalWakeTime}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Insufficient sleep */}

            <View style={styles.insufficientRow}>
              <View style={styles.insufficientText}>
                <Text style={styles.statTitle}>
                  Nights under 7 hours
                </Text>

                <Text style={styles.statCaption}>
                  {insufficient?.status === "insufficient_data"
                    ? "Not enough data yet"
                    : `${insufficient?.percentageInsufficient ?? 0}% of recorded nights`}
                </Text>
              </View>

              <Text style={styles.statValue}>
                {insufficient?.status === "insufficient_data"
                  ? "—"
                  : Math.round(
                      (profile.sleepHistory.numberOfNights *
                        (insufficient?.percentageInsufficient ?? 0)) /
                        100
                    )}
              </Text>
            </View>
          </View>

          {/* Personalised interpretation */}

          <View style={styles.routineCard}>
            <Text style={styles.routineLabel}>
              YOUR SLEEP ROUTINE
            </Text>

            <Text style={styles.routineTitle}>
              Understanding your patterns
            </Text>

            <Text style={styles.routineBody}>
              {getSleepRoutineMessage(profile)}
            </Text>
          </View>

          <Text style={styles.footnote}>
            These insights reflect trends in your available
            sleep records and are not medical diagnoses.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------
// Styling
// ---------------------------------------------

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

  heading: {
    fontSize: 36,
    fontWeight: "700",
    color: "#263D31",
  },

  subtitle: {
    fontSize: 14,
    color: "#69756C",
    marginTop: 8,
    marginBottom: 28,
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

  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#263D31",
    marginBottom: 10,
  },

  metric: {
    fontSize: 32,
    fontWeight: "700",
    color: "#263D31",
    marginTop: 16,
  },

  metricCaption: {
    fontSize: 13,
    color: "#69756C",
    marginTop: 5,
  },

  divider: {
    height: 1,
    backgroundColor: "#E5ECE3",
    marginVertical: 22,
  },

  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  scheduleItem: {
    width: "48%",
  },

  scheduleLabel: {
    fontSize: 12,
    color: "#69756C",
    marginBottom: 8,
  },

  scheduleValue: {
    fontSize: 19,
    fontWeight: "700",
    color: "#263D31",
  },

  insufficientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  insufficientText: {
    flex: 1,
  },

  statTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#263D31",
  },

  statCaption: {
    fontSize: 12,
    color: "#69756C",
    marginTop: 5,
  },

  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#263D31",
  },

  routineCard: {
    backgroundColor: "#E5ECE3",
    borderRadius: 20,
    padding: 24,
    marginBottom: 18,
  },

  routineLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#426B52",
    marginBottom: 12,
  },

  routineTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#263D31",
    marginBottom: 10,
  },

  routineBody: {
    fontSize: 14,
    lineHeight: 23,
    color: "#4E6455",
  },

  body: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4E6255",
    marginTop: 14,
  },

  footnote: {
    fontSize: 12,
    lineHeight: 19,
    color: "#69756C",
    marginTop: 4,
  },

  loader: {
    marginVertical: 36,
  },

  retryButton: {
    backgroundColor: "#426B52",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 18,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
