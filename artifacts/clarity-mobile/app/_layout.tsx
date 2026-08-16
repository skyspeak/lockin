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
import React, { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthScreen } from "@/components/AuthScreen";
import { ApiKeyContext, SessionContext } from "@/components/AuthContext";
import { getApiBasePath, normalizeApiOrigin, resolveDefaultApiOrigin } from "@/constants/api";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const STORAGE_KEY = "clarity_api_key";
const SERVER_STORAGE_KEY = "clarity_api_server_url";

function applyApiOrigin(origin: string) {
  setBaseUrl(normalizeApiOrigin(origin));
}

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
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(SERVER_STORAGE_KEY),
    ])
      .then(([storedKey, storedServer]) => {
        const server = storedServer || resolveDefaultApiOrigin();
        if (storedKey && server) {
          applyApiOrigin(server);
          setAuthTokenGetter(() => storedKey);
          setApiKey(storedKey);
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

  const logout = useCallback(() => {
    AsyncStorage.multiRemove([STORAGE_KEY, SERVER_STORAGE_KEY]).catch(() => {});
    setAuthTokenGetter(null);
    setApiKey("");
  }, []);

  const deleteAccount = useCallback(async () => {
    const origin = (await AsyncStorage.getItem(SERVER_STORAGE_KEY)) || resolveDefaultApiOrigin();
    if (apiKey && origin) {
      try {
        await fetch(`${getApiBasePath(origin)}/auth/account`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch {
        // Still sign out locally so the device is not stuck.
      }
    }
    logout();
  }, [apiKey, logout]);

  if ((!fontsLoaded && !fontError) || !keyChecked) return null;

  if (!apiKey) {
    return (
      <SafeAreaProvider>
        <AuthScreen
          onAuth={(serverUrl, token) => {
            AsyncStorage.multiSet([
              [STORAGE_KEY, token],
              [SERVER_STORAGE_KEY, serverUrl],
            ]).catch(() => {});
            applyApiOrigin(serverUrl);
            setAuthTokenGetter(() => token);
            setApiKey(token);
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SessionContext.Provider value={{ logout, deleteAccount }}>
      <ApiKeyContext.Provider value={apiKey}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ApiKeyContext.Provider>
    </SessionContext.Provider>
  );
}
