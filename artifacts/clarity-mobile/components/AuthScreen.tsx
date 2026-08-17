import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";

interface AuthScreenProps {
  onAuth: (serverUrl: string, token: string) => void;
}

type Step = "invite" | "account";
type Mode = "signin" | "signup";

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const serverUrl = resolveDefaultApiOrigin();
  const [step, setStep] = useState<Step>("invite");
  const [mode, setMode] = useState<Mode>("signup");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const apiBase = serverUrl ? getApiBasePath(serverUrl) : "";

  const checkInvite = async () => {
    const code = inviteCode.trim();
    if (!serverUrl || !apiBase) {
      setError("This build is missing the Clarity server URL.");
      return;
    }
    if (!code) {
      setError("Input your special invite code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "That invite code is not valid.");
        return;
      }
      setError("");
      setStep("account");
    } catch {
      setError("Could not reach Clarity. Check your network.");
    } finally {
      setBusy(false);
    }
  };

  const submitAccount = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? { email: trimmedEmail, password, inviteCode: inviteCode.trim() }
            : { email: trimmedEmail, password },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok) {
        setError(body.error || `Server returned ${res.status}`);
        return;
      }
      if (!body.token) {
        setError("Could not start a session. Please try again.");
        return;
      }
      onAuth(serverUrl, body.token);
    } catch {
      setError("Could not reach Clarity. Check your network.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.kicker}>VOICE FIRST</Text>
        <Text style={styles.title}>Clarity</Text>

        {step === "invite" ? (
          <>
            <Text style={styles.subtitle}>Input your special invite code.</Text>
            <Text style={styles.label}>Special invite code</Text>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={(t) => {
                setInviteCode(t);
                setError("");
              }}
              placeholder="Special invite code"
              placeholderTextColor="#b0a79f"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              onSubmitEditing={() => void checkInvite()}
              returnKeyType="done"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              onPress={() => void checkInvite()}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{busy ? "Please wait…" : "Continue"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {mode === "signup" ? "Create your account." : "Sign in to your account."}
            </Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError("");
              }}
              placeholder="you@email.com"
              placeholderTextColor="#b0a79f"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError("");
              }}
              placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
              placeholderTextColor="#b0a79f"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === "signup" ? "newPassword" : "password"}
              autoComplete={mode === "signup" ? "password-new" : "password"}
              onSubmitEditing={() => void submitAccount()}
              returnKeyType="done"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              onPress={() => void submitAccount()}
              disabled={busy}
            >
              <Text style={styles.buttonText}>
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
              }}
              style={styles.switchMode}
            >
              <Text style={styles.switchModeText}>
                {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
              </Text>
            </Pressable>
          </>
        )}

        <Text style={styles.legal}>
          By continuing you agree to the Terms and Privacy Policy on the Clarity website.
        </Text>
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
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    color: "#c8553d",
    textAlign: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
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
    lineHeight: 20,
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
  switchMode: {
    marginTop: 16,
    alignItems: "center",
  },
  switchModeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#c8553d",
  },
  legal: {
    marginTop: 20,
    fontSize: 12,
    color: "#7a716b",
    textAlign: "center",
    lineHeight: 18,
  },
});
