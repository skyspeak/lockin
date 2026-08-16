import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "@/components/AuthContext";
import { resolveDefaultApiOrigin } from "@/constants/api";

const SERVER_STORAGE_KEY = "clarity_api_server_url";

async function openWebTasks() {
  const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
  const origin = (stored || resolveDefaultApiOrigin()).replace(/\/+$/, "");
  if (!origin) return;
  await WebBrowser.openBrowserAsync(origin);
}

async function openTestFlightUpdate() {
  const testflight = "itms-beta://";
  const canOpen = await Linking.canOpenURL(testflight);
  if (canOpen) {
    await Linking.openURL(testflight);
    return;
  }
  await Linking.openURL("https://apps.apple.com/app/testflight/id899247664");
}

export default function SettingsScreen() {
  const { logout } = useSession();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>Account, web tasks, and TestFlight updates.</Text>

      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => void openWebTasks()}>
          <Text style={styles.rowTitle}>View tasks on the web</Text>
          <Text style={styles.rowHint}>Opens your Clarity server in Safari</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={() => void openTestFlightUpdate()}>
          <Text style={styles.rowTitle}>Get TestFlight update</Text>
          <Text style={styles.rowHint}>Opens TestFlight so you can install the latest build</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={logout}>
          <Text style={[styles.rowTitle, styles.danger]}>Log out</Text>
          <Text style={styles.rowHint}>Clears the API key on this phone</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fdfbf7", paddingHorizontal: 24 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#1a1715",
    marginTop: 12,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#7a716b",
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ebe5dd",
    overflow: "hidden",
  },
  row: { paddingHorizontal: 16, paddingVertical: 16 },
  rowTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#1a1715",
  },
  rowHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#7a716b",
    marginTop: 4,
    lineHeight: 18,
  },
  hairline: { height: 1, backgroundColor: "#ebe5dd", marginLeft: 16 },
  danger: { color: "#c0392b" },
});
