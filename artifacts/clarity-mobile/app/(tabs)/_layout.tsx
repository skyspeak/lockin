import { Tabs } from "expo-router";
import { Platform, Text } from "react-native";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#ff5a7a",
        tabBarInactiveTintColor: "#a06d62",
        tabBarStyle: {
          backgroundColor: "#fff3e6",
          borderTopColor: "#f5d5c4",
          paddingTop: 4,
          height: Platform.OS === "ios" ? 88 : 64,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Speak",
          tabBarIcon: ({ color }) => <TabIcon emoji="🎙️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => <TabIcon emoji="✓" color={color} />,
        }}
      />
      <Tabs.Screen
        name="follow-ups"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <TabIcon emoji="🌙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 22, color, opacity: color === "#ff5a7a" ? 1 : 0.72 }}>{emoji}</Text>;
}
