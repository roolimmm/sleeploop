import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

type BedtimeModalProps = {
  visible: boolean;
  onClose: () => void;
};

type BedtimePlan = {
  nightDate: string;
  plannedBedtime: string;
};

const STORAGE_KEY = "bedtimePlans";

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A sleep night starts at noon and continues through the following morning.
function currentNightKey(now: Date): string {
  const night = new Date(now);
  if (night.getHours() < 12) night.setDate(night.getDate() - 1);
  return localDateKey(night);
}

function nextAvailableTime(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 5);
  return date;
}

// After noon, 00:00–11:59 means the following morning.
function resolveSelectedDate(selected: Date, now: Date): Date {
  const result = new Date(now);
  result.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  if (now.getHours() >= 12 && selected.getHours() < 12) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function BedtimeModal({ visible, onClose }: BedtimeModalProps) {
  const [bedtime, setBedtime] = useState<Date>(() => nextAvailableTime());
  const [hasConfirmedPlan, setHasConfirmedPlan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;

    const loadPlan = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const plans: BedtimePlan[] = raw ? JSON.parse(raw) : [];
        const existing = plans.find(
          (plan) => plan.nightDate === currentNightKey(now)
        );
        if (!active) return;
        setHasConfirmedPlan(Boolean(existing));

        if (existing && /^\d{2}:\d{2}$/.test(existing.plannedBedtime)) {
          const [hours, minutes] = existing.plannedBedtime.split(":").map(Number);
          const selected = new Date(now);
          selected.setHours(hours, minutes, 0, 0);
          const resolved = resolveSelectedDate(selected, now);
          setBedtime(resolved > now ? resolved : nextAvailableTime());
        } else {
          setBedtime(nextAvailableTime());
        }
      } catch (error) {
        console.error("Unable to load bedtime plan:", error);
        if (active) {
          setHasConfirmedPlan(false);
          setBedtime(nextAvailableTime());
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPlan();
    return () => {
      active = false;
    };
  }, [visible]);

  const handleTimeChange = (_event: unknown, selectedTime?: Date) => {
    if (!selectedTime) return;
    setBedtime(resolveSelectedDate(selectedTime, new Date()));
  };

  const saveBedtime = async () => {
    if (saving) return;
    const now = new Date();
    const selected = resolveSelectedDate(bedtime, now);
    if (selected <= now) return;

    setSaving(true);
    try {
      const nightDate = currentNightKey(now);
      const bedtimePlan: BedtimePlan = {
        nightDate,
        plannedBedtime: formatTime(selected),
      };
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const plans: BedtimePlan[] = raw ? JSON.parse(raw) : [];
      const updated = plans.filter((plan) => plan.nightDate !== nightDate);
      updated.push(bedtimePlan);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setHasConfirmedPlan(true);
      onClose();
    } catch (error) {
      console.error("Error saving bedtime:", error);
      Alert.alert("Unable to save", "Please try confirming your bedtime again.");
    } finally {
      setSaving(false);
    }
  };

  const isPastTime = resolveSelectedDate(bedtime, new Date()) <= new Date();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {hasConfirmedPlan
              ? "Change your planned bedtime"
              : "What time do you plan to sleep tonight?"}
          </Text>
          {loading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <>
              <DateTimePicker
                value={bedtime}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={handleTimeChange}
              />
              <Text style={styles.helper}>
                Early-morning times count towards tonight's sleep plan.
              </Text>
              <View style={styles.buttonRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || isPastTime}
                  style={[
                    styles.confirmButton,
                    (saving || isPastTime) && styles.disabledButton,
                  ]}
                  onPress={() => void saveBedtime()}
                >
                  <Text style={styles.confirmText}>
                    {saving ? "Saving…" : "Confirm"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  style={styles.secondaryButton}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryText}>
                    {hasConfirmedPlan ? "Cancel" : "Not sure yet"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
 overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 24,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#263D31",
    textAlign: "center",
  },
  loading: { 
    marginVertical: 28 
  },
  helper: {
    fontSize: 10,
    color: "#8A948D",
    textAlign: "center",
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 20
  },
  confirmButton: {
    flex: 1,
    backgroundColor: "#426B52",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#F0F5F0",
    borderWidth: 1,
    borderColor: "#426B52",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: { opacity: 0.45 },
  confirmText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  secondaryText: { color: "#426B52", fontSize: 13, fontWeight: "600" },
});
