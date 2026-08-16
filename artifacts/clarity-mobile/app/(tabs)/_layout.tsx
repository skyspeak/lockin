import { Tabs } from "expo-router";
import { Platform, Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#c8553d",
        tabBarInactiveTintColor: "#7a716b",
        tabBarStyle: {
          backgroundColor: "#fdfbf7",
          borderTopColor: "#ebe5dd",
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
          tabBarIcon: ({ color }) => <TabIcon emoji="🎤" color={color} />,
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
          title: "Follow-ups",
          tabBarIcon: ({ color }) => <TabIcon emoji="→" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <TabIcon emoji="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color, opacity: color === "#c8553d" ? 1 : 0.7 }}>{emoji}</Text>;
}
