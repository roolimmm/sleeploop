import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function RootLayout() {
  return (
    <Tabs>
      <Tabs.Screen
      name="index"
      options={{ 
        headerTitle: "SleepLoop",
        tabBarIcon: () => <Ionicons name="home" size={24} /> 
      }} 
      />
      
      <Tabs.Screen
        name="about"
        options={{
          headerTitle: "About",
          tabBarIcon: () => <Ionicons name="information-circle" size={24} />
        }}
      />
    </Tabs>
  );
}
