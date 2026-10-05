import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Button, Modal, StyleSheet, Text, View } from "react-native";

type BedtimeModalProps = {
  visible: boolean;
  onClose: () => void;
};

export default function BedtimeModal({
  visible,
  onClose,
}: BedtimeModalProps) {
  const [bedtime, setBedtime] = useState(new Date());
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  
  const saveBedtime = async () => {
    try {
    const nightDate = getLocalDateString(new Date());
    const hours = String(bedtime.getHours()).padStart(2, "0");
    const minutes = String(bedtime.getMinutes()).padStart(2, "0");

    const bedtimePlan = {
      nightDate: nightDate,
      plannedBedtime: `${hours}:${minutes}`,
    };

    // Get previously saved bedtime plans
    const existingData = await AsyncStorage.getItem("bedtimePlans");

    const bedtimePlans = existingData
      ? JSON.parse(existingData)
      : [];

    // Remove an existing entry for tonight, if there is one
    const updatedPlans = bedtimePlans.filter(
      (plan: { nightDate: string }) => plan.nightDate !== nightDate
    );

    // Add tonight's new bedtime
    updatedPlans.push(bedtimePlan);

    // Save the whole history
    await AsyncStorage.setItem(
      "bedtimePlans",
      JSON.stringify(updatedPlans)
    );

    console.log("Saved bedtime plan:", bedtimePlan);
    console.log("All bedtime plans:", updatedPlans);

    onClose();
    } catch (error) {
    console.log("Error saving bedtime:", error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text>What time do you plan to sleep tonight?</Text>

          <DateTimePicker
          value={bedtime}
          mode="time"
          display="spinner"
          themeVariant="light"
          onValueChange={(event, selectedTime) => {
            if (selectedTime) {
            setBedtime(selectedTime);
            }
            }}
          />

          <View style={styles.buttonRow}>
            <Button
            title="Confirm"
            onPress={saveBedtime}
            />

            <Button
            title="Not sure yet"
            onPress={onClose}
            />
          </View>
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

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 16,
},
});