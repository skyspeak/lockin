import { Tabs } from "expo-router";
import { Platform, View } from "react-native";

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
          borderTopWidth: 1,
          paddingTop: 6,
          height: Platform.OS === "ios" ? 84 : 60,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Speak",
          tabBarIcon: ({ color, focused }) => <MicGlyph color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, focused }) => <CheckGlyph color={color} focused={focused} />,
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
          tabBarIcon: ({ color, focused }) => <GearGlyph color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function MicGlyph({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: focused ? 2 : 1.5,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function CheckGlyph({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: focused ? 2 : 1.5,
        borderColor: color,
      }}
    />
  );
}

function GearGlyph({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: focused ? 2 : 1.5,
        borderColor: color,
      }}
    />
  );
}
