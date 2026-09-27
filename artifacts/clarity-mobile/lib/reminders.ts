import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";

const PUSH_TOKEN_KEY = "lockin_push_token";
const API_KEY_KEY = "clarity_api_key";
const SERVER_KEY = "clarity_api_server_url";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let listening = false;

function listenForReminderTaps() {
  if (listening) return;
  listening = true;
  Notifications.addNotificationResponseReceivedListener(() => {
    router.push("/(tabs)/tasks");
  });
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function reminderPermission(): Promise<"on" | "off" | "unavailable"> {
  if (Platform.OS === "web") return "unavailable";
  const current = await Notifications.getPermissionsAsync();
  return current.status === "granted" ? "on" : "off";
}

export async function registerPushReminders(apiBase: string, apiKey: string): Promise<"on" | "off" | "unavailable"> {
  if (Platform.OS === "web") return "unavailable";
  listenForReminderTaps();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return "off";

  const id = projectId();
  if (!id) return "unavailable";

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const res = await fetch(`${apiBase}/push/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: token.data, platform: Platform.OS }),
    });
    if (!res.ok) return "off";
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);
    return "on";
  } catch {
    return "unavailable";
  }
}

export async function unregisterPushReminders(): Promise<void> {
  const pairs = await AsyncStorage.multiGet([API_KEY_KEY, SERVER_KEY, PUSH_TOKEN_KEY]);
  const stored = Object.fromEntries(pairs);
  const apiKey = stored[API_KEY_KEY]?.trim();
  const token = stored[PUSH_TOKEN_KEY]?.trim();
  const origin = stored[SERVER_KEY] || resolveDefaultApiOrigin();
  if (apiKey && token && origin) {
    try {
      await fetch(`${getApiBasePath(origin)}/push/register`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Sign-out still continues. The next login replaces this token.
    }
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
