import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApiKey, useSession } from "@/components/AuthContext";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";

const SERVER_STORAGE_KEY = "clarity_api_server_url";
const PRIVACY_PATH = "/privacy";
const TERMS_PATH = "/terms";

async function openWeb(path = "") {
  const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
  const origin = (stored || resolveDefaultApiOrigin()).replace(/\/+$/, "");
  if (!origin) return;
  await WebBrowser.openBrowserAsync(`${origin}${path}`);
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
  const { logout, deleteAccount } = useSession();
  const apiKey = useApiKey();

  const connectGmail = async () => {
    const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
    const origin = stored || resolveDefaultApiOrigin();
    if (!origin) return;
    try {
      const res = await fetch(`${getApiBasePath(origin)}/google/connect`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        Alert.alert("Gmail", body.error || "Could not start Gmail connect.");
        return;
      }
      await WebBrowser.openBrowserAsync(body.url);
    } catch {
      Alert.alert("Gmail", "Could not start Gmail connect.");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your tasks and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteAccount();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>The quiet stuff behind the lock.</Text>

      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => void connectGmail()}>
          <Text style={styles.rowTitle}>Connect Gmail</Text>
          <Text style={styles.rowHint}>Used for the 9pm task email and calendar invites</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={() => void openWeb()}>
          <Text style={styles.rowTitle}>View tasks on the web</Text>
          <Text style={styles.rowHint}>Opens Lock In in Safari</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={() => void openWeb(PRIVACY_PATH)}>
          <Text style={styles.rowTitle}>Privacy Policy</Text>
          <Text style={styles.rowHint}>How we handle your voice and tasks</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={() => void openWeb(TERMS_PATH)}>
          <Text style={styles.rowTitle}>Terms of Use</Text>
          <Text style={styles.rowHint}>The rules for using Lock In</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={() => void openTestFlightUpdate()}>
          <Text style={styles.rowTitle}>Get TestFlight update</Text>
          <Text style={styles.rowHint}>Opens TestFlight so you can install the latest build</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={logout}>
          <Text style={styles.rowTitle}>Log out</Text>
          <Text style={styles.rowHint}>Sign out on this phone. Your tasks stay in your account.</Text>
        </Pressable>
        <View style={styles.hairline} />
        <Pressable style={styles.row} onPress={confirmDelete}>
          <Text style={[styles.rowTitle, styles.danger]}>Delete account</Text>
          <Text style={styles.rowHint}>Permanently remove your account and all tasks</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff3e6", paddingHorizontal: 24 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#3a241e",
    marginTop: 12,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#a06d62",
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f5d5c4",
    overflow: "hidden",
  },
  row: { paddingHorizontal: 16, paddingVertical: 16 },
  rowTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#3a241e",
  },
  rowHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#a06d62",
    marginTop: 4,
    lineHeight: 18,
  },
  hairline: { height: 1, backgroundColor: "#f5d5c4", marginLeft: 16 },
  danger: { color: "#c0392b" },
});
