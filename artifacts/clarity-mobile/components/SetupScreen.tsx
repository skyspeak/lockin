import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeApiOrigin, resolveDefaultApiOrigin } from "@/constants/api";

interface SetupScreenProps {
  onSetup: (serverUrl: string, key: string) => void;
}

export function SetupScreen({ onSetup }: SetupScreenProps) {
  const [serverUrl, setServerUrl] = useState(resolveDefaultApiOrigin());
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const trimmedKey = value.trim();
    const trimmedServer = normalizeApiOrigin(serverUrl);
    if (!trimmedServer) {
      setError("API server URL is required");
      return;
    }
    if (!trimmedKey) {
      setError("API key is required");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${trimmedServer}/api/actions/queue`, {
        headers: { Authorization: `Bearer ${trimmedKey}` },
      });
      if (res.status === 401) {
        setError("API key does not match this server");
        return;
      }
      if (!res.ok) {
        setError(`Server returned ${res.status}. Check the API URL.`);
        return;
      }
      onSetup(trimmedServer, trimmedKey);
    } catch {
      setError("Could not reach the API. Check the URL and your network.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Clarity</Text>
        <Text style={styles.subtitle}>Connect to your Clarity server</Text>

        <Text style={styles.label}>API server</Text>
        <TextInput
          style={[styles.input, error && !serverUrl.trim() ? styles.inputError : null]}
          value={serverUrl}
          onChangeText={(t) => {
            setServerUrl(t);
            setError("");
          }}
          placeholder="https://your-server.example.com"
          placeholderTextColor="#b0a79f"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
        />

        <Text style={styles.label}>API key</Text>
        <TextInput
          style={[styles.input, error && !value.trim() ? styles.inputError : null]}
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError("");
          }}
          placeholder="API key"
          placeholderTextColor="#b0a79f"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, busy ? styles.buttonDisabled : null]}
          onPress={handleSubmit}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? "Checking…" : "Unlock"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdfbf7",
    justifyContent: "center",
  },
  inner: {
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: "#1a1715",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#7a716b",
    textAlign: "center",
    marginBottom: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7a716b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ebe5dd",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: "#1a1715",
    marginBottom: 16,
  },
  inputError: {
    borderColor: "#c0392b",
  },
  error: {
    fontSize: 12,
    color: "#c0392b",
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#c8553d",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
