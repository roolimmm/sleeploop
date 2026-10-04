import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
    >
    <Tabs.Screen
    name="index"
    options={{ 
      tabBarIcon: () => <Ionicons name="home" size={24} /> 
    }} 
      />
      
    <Tabs.Screen
    name="about"
    options={{
      tabBarIcon: () => <Ionicons name="information-circle" size={24} />
    }}
    />
    </Tabs>
  );
}
