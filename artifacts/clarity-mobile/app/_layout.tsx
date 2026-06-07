import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SetupScreen } from "@/components/SetupScreen";
import { ApiKeyContext } from "@/components/AuthContext";

if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const STORAGE_KEY = "clarity_api_key";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          setAuthTokenGetter(() => stored);
          setApiKey(stored);
        } else {
          setApiKey("");
        }
      })
      .catch(() => {
        setApiKey("");
      })
      .finally(() => {
        setKeyChecked(true);
      });
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && keyChecked) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, keyChecked]);

  if ((!fontsLoaded && !fontError) || !keyChecked) return null;

  if (!apiKey) {
    return (
      <SafeAreaProvider>
        <SetupScreen
          onSetup={(key) => {
            AsyncStorage.setItem(STORAGE_KEY, key).catch(() => {});
            setAuthTokenGetter(() => key);
            setApiKey(key);
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <ApiKeyContext.Provider value={apiKey}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }} />
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ApiKeyContext.Provider>
  );
}
