import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
} from "expo-audio";
import { getGetActionQueueUrl } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiKey } from "@/components/AuthContext";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";
import { alertCaptureFailure } from "@/lib/captureAlerts";
import {
  RECORD_OPTIONS,
  beginRecording,
  recorderIsLive,
  recordingTooShort,
  releaseAudioSession,
  stopActiveRecording,
  uploadCaptureAudio,
} from "@/lib/recording";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  bg: "#fff3e6",
  ink: "#3a241e",
  inkDim: "#a06d62",
  accent: "#ff5a7a",
  accentActive: "#e63e64",
};

const SERVER_STORAGE_KEY = "clarity_api_server_url";
const CAPTURE_MODE_KEY = "lockin_capture_mode";

export type CaptureMode = "tasks" | "transcribe";

async function resolveApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
  const origin = stored || resolveDefaultApiOrigin();
  return getApiBasePath(origin);
}

export function useVoiceCapture() {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();
  const queueUrl = getGetActionQueueUrl();
  const recorder = useAudioRecorder(RECORD_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<{ title: string; nextSteps: string[] }[]>([]);
  const [lastTranscript, setLastTranscript] = useState("");
  const [captureMode, setCaptureModeState] = useState<CaptureMode>("tasks");
  const captureModeRef = useRef<CaptureMode>("tasks");
  const focusedRef = useRef(false);
  const recordingRef = useRef(false);
  const transcribingRef = useRef(false);
  /** Serialize prepare/stop so a restart never overlaps a stop (native crash). */
  const micLockRef = useRef<Promise<void>>(Promise.resolve());
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});
  /** Drive glow off the JS thread without re-rendering the whole Speak screen. */
  const energyAnim = useRef(new Animated.Value(0.22)).current;

  const withMicLock = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    const previous = micLockRef.current;
    let release!: () => void;
    micLockRef.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestart = useCallback((delayMs = 400) => {
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (focusedRef.current && !transcribingRef.current) {
        void startRecordingRef.current();
      }
    }, delayMs);
  }, [clearRestartTimer]);

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const setCaptureMode = useCallback((mode: CaptureMode) => {
    captureModeRef.current = mode;
    setCaptureModeState(mode);
    AsyncStorage.setItem(CAPTURE_MODE_KEY, mode).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CAPTURE_MODE_KEY).then((stored) => {
      if (stored === "transcribe" || stored === "tasks") {
        captureModeRef.current = stored;
        setCaptureModeState(stored);
      }
    }).catch(() => {});
  }, []);

  const resetRecordingUi = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    await withMicLock(async () => {
      if (recordingRef.current || transcribingRef.current || !focusedRef.current) return;
      try {
        await beginRecording(recorder);
        if (!focusedRef.current || transcribingRef.current) {
          if (recorderIsLive(recorder)) {
            await stopActiveRecording(recorder);
          }
          resetRecordingUi();
          return;
        }
        recordingRef.current = true;
        setIsRecording(true);
      } catch (err) {
        resetRecordingUi();
        if (err instanceof Error && err.message === "MIC_PERMISSION_DENIED") {
          Alert.alert("Mic unavailable", "Please grant microphone permission in Settings.");
        } else {
          Alert.alert("Mic didn't start", "Tap the mic to try again.");
        }
      }
    });
  }, [recorder, resetRecordingUi, withMicLock]);
  startRecordingRef.current = startRecording;

  const stopOnly = useCallback(async () => {
    clearRestartTimer();
    await withMicLock(async () => {
      if (recorderIsLive(recorder)) {
        try {
          await recorder.stop();
        } catch {
          // already stopped
        }
      }
      resetRecordingUi();
      await releaseAudioSession();
    });
  }, [clearRestartTimer, recorder, resetRecordingUi, withMicLock]);

  const stopAndTranscribe = useCallback(async () => {
    if (transcribingRef.current) return;
    if (!apiKey.trim()) {
      Alert.alert("Not signed in", "Log out and sign in again from Settings.");
      return;
    }

    const live = recordingRef.current || recorderIsLive(recorder);
    if (!live) {
      void startRecordingRef.current();
      return;
    }

    clearRestartTimer();

    const capture = await withMicLock(async () => {
      if (!recordingRef.current && !recorderIsLive(recorder)) {
        return null;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const stopped = await stopActiveRecording(recorder);
      resetRecordingUi();
      return stopped;
    });

    if (!capture?.uri) {
      Alert.alert("Couldn't save that clip", "Tap the mic, speak for a second, then tap again.");
      if (focusedRef.current) scheduleRestart(400);
      return;
    }

    if (recordingTooShort(capture.durationMillis)) {
      Alert.alert("Too short", "Speak for at least a second, then tap to lock it in.");
      if (focusedRef.current) scheduleRestart(400);
      return;
    }

    transcribingRef.current = true;
    setIsTranscribing(true);

    try {
      const apiBase = await resolveApiBase();
      const mode = captureModeRef.current;
      const res = await uploadCaptureAudio(apiBase, apiKey, capture.uri, mode);
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { error?: string };
          detail = body.error ?? "";
        } catch {
          detail = "";
        }
        alertCaptureFailure(mode, res.status, detail);
        return;
      }
      const json = (await res.json()) as {
        transcript?: string;
        actions?: { title: string; nextSteps?: string[]; description?: string | null }[];
        calendarCreated?: number;
        calendarError?: string;
        emails?: Array<{ title: string; subject: string; to: string[]; sent: boolean; error?: string }>;
        research?: Array<{ title: string; type?: string; answer: string }>;
        kinds?: string[];
      };
      const items = (json.actions ?? [])
        .map((a) => ({ title: a.title, nextSteps: a.nextSteps ?? [] }))
        .filter((a) => a.title);
      const text = json.transcript?.trim() || "";
      if (mode === "transcribe") {
        if (!text && items.length === 0) {
          Alert.alert("Nothing captured", "Try speaking again.");
          return;
        }
        setLastTranscript(text);
        setLastCaptured(items);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateQueue();
        return;
      }
      if (items.length === 0) {
        Alert.alert("Nothing captured", "Try speaking again.");
        return;
      }

      setLastCaptured(items);
      setLastTranscript("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateQueue();

      const sentEmails = (json.emails ?? []).filter((e) => e.sent);
      const blockedEmails = (json.emails ?? []).filter((e) => !e.sent);
      const researchBits = json.research ?? [];

      if (researchBits.length > 0) {
        Alert.alert(
          researchBits.length === 1 ? "Research ready" : "Research locked in",
          researchBits.map((r) => r.answer.slice(0, 280)).join("\n\n"),
        );
      } else if (sentEmails.length > 0) {
        Alert.alert(
          sentEmails.length === 1 ? "Email sent" : "Emails sent",
          sentEmails.map((e) => `${e.subject} → ${e.to.join(", ")}`).join("\n"),
        );
      } else if (blockedEmails.length > 0) {
        Alert.alert(
          "Draft saved",
          blockedEmails.map((e) => e.error || "Need a recipient email before sending.").join("\n"),
        );
      } else if (json.calendarCreated && json.calendarCreated > 0) {
        Alert.alert("On your calendar", `${json.calendarCreated} event${json.calendarCreated === 1 ? "" : "s"} added.`);
      } else if (json.calendarError) {
        Alert.alert("Task saved", "Calendar invite did not send. Connect Gmail in Settings.");
      } else if ((json.kinds ?? []).includes("task") || items.length > 0) {
        // Deep solve map already attached to the task — light confirmation.
      }
    } catch {
      Alert.alert("Couldn't reach Lock In", "Check your connection and try again.");
    } finally {
      transcribingRef.current = false;
      setIsTranscribing(false);
      if (focusedRef.current) scheduleRestart(450);
    }
  }, [apiKey, clearRestartTimer, invalidateQueue, recorder, resetRecordingUi, scheduleRestart, withMicLock]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      void startRecordingRef.current();
      return () => {
        focusedRef.current = false;
        clearRestartTimer();
        void stopOnly();
      };
    }, [clearRestartTimer, stopOnly]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        clearRestartTimer();
        void stopOnly();
        return;
      }
      if (focusedRef.current) scheduleRestart(300);
    });
    return () => {
      sub.remove();
      clearRestartTimer();
    };
  }, [clearRestartTimer, scheduleRestart, stopOnly]);

  const onMicPress = () => {
    if (isTranscribing) return;
    const live = recordingRef.current || recorderIsLive(recorder);
    if (live) void stopAndTranscribe();
    else void startRecording();
  };

  useEffect(() => {
    if (!isRecording || isTranscribing) {
      energyAnim.setValue(0.22);
      return;
    }
    const id = setInterval(() => {
      try {
        const metering = recorder.getStatus().metering;
        energyAnim.setValue(normalizeMetering(metering));
      } catch {
        // recorder may be mid restart
      }
    }, 180);
    return () => clearInterval(id);
  }, [energyAnim, isRecording, isTranscribing, recorder]);

  return {
    isRecording,
    isTranscribing,
    lastCaptured,
    lastTranscript,
    captureMode,
    setCaptureMode,
    onMicPress,
    energyAnim,
  };
}

function normalizeMetering(db?: number): number {
  if (typeof db !== "number" || Number.isNaN(db)) return 0.22;
  const min = -55;
  const max = -8;
  return Math.min(1, Math.max(0, (db - min) / (max - min)));
}

const RING_COUNT = 2;
const RING_MS = 2200;

function ListeningAura({
  active,
  energy,
}: {
  active: boolean;
  energy: Animated.Value;
}) {
  const rings = useRef(
    Array.from({ length: RING_COUNT }, () => new Animated.Value(0)),
  ).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      rings.forEach((ring) => ring.setValue(0));
      breathe.setValue(0);
      return;
    }

    const stoppers = rings.map((ring, index) => {
      const loop = Animated.loop(
        Animated.timing(ring, {
          toValue: 1,
          duration: RING_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );
      const delay = setTimeout(() => loop.start(), index * (RING_MS / RING_COUNT));
      return () => {
        clearTimeout(delay);
        loop.stop();
        ring.setValue(0);
      };
    });

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breatheLoop.start();

    return () => {
      stoppers.forEach((stop) => stop());
      breatheLoop.stop();
    };
  }, [active, breathe, rings]);

  if (!active) return null;

  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });
  const glowScale = energy.interpolate({
    inputRange: [0, 1],
    outputRange: [1.06, 1.55],
  });
  const glowOpacity = energy.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.48],
  });

  return (
    <>
      {rings.map((ring, index) => {
        const scale = ring.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.35],
        });
        const opacity = ring.interpolate({
          inputRange: [0, 0.2, 1],
          outputRange: [0.5, 0.32, 0],
        });
        return (
          <Animated.View
            key={index}
            pointerEvents="none"
            style={[
              styles.ripple,
              index === 1 ? styles.rippleMint : null,
              { transform: [{ scale }], opacity },
            ]}
          />
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[styles.voiceGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.breatheHalo, { transform: [{ scale: breatheScale }] }]}
      />
    </>
  );
}

type VoiceCaptureHeroProps = {
  isRecording: boolean;
  isTranscribing: boolean;
  lastCaptured: { title: string; nextSteps: string[] }[];
  lastTranscript?: string;
  captureMode?: CaptureMode;
  onCaptureModeChange?: (mode: CaptureMode) => void;
  onMicPress: () => void;
  energyAnim: Animated.Value;
};

export function VoiceCaptureHero({
  isRecording,
  isTranscribing,
  lastCaptured,
  lastTranscript = "",
  captureMode = "tasks",
  onCaptureModeChange,
  onMicPress,
  energyAnim,
}: VoiceCaptureHeroProps) {
  const transcribeOnly = captureMode === "transcribe";
  return (
    <View style={styles.hero}>
      <View style={styles.blobOne} pointerEvents="none" />
      <View style={styles.blobTwo} pointerEvents="none" />
      <Text style={styles.kicker}>dump it. lock it.</Text>
      <Text style={styles.brand}>Lock In</Text>
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => onCaptureModeChange?.("tasks")}
          style={[styles.modeChip, !transcribeOnly && styles.modeChipOn]}
        >
          <Text style={[styles.modeChipText, !transcribeOnly && styles.modeChipTextOn]}>Tasks</Text>
        </Pressable>
        <Pressable
          onPress={() => onCaptureModeChange?.("transcribe")}
          style={[styles.modeChip, transcribeOnly && styles.modeChipOn]}
        >
          <Text style={[styles.modeChipText, transcribeOnly && styles.modeChipTextOn]}>Notes</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        {isTranscribing
          ? transcribeOnly
            ? "Writing that down…"
            : "Cooking it into tasks…"
          : isRecording
            ? transcribeOnly
              ? "Ears open. Tap when the thought’s out."
              : "Ears open. Tap when you’re done."
            : "Waking the mic…"}
      </Text>

      <View style={styles.micCol}>
        <View style={styles.micStage}>
          <ListeningAura active={isRecording && !isTranscribing} energy={energyAnim} />
          <Pressable
            onPress={onMicPress}
            disabled={isTranscribing}
            style={({ pressed }) => [
              styles.mic,
              isRecording && styles.micActive,
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            {isTranscribing ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={styles.micIcon}>{isRecording ? "✦" : "🎙️"}</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.micLabel}>
          {isTranscribing
            ? transcribeOnly
              ? "Almost…"
              : "Mapping it…"
            : isRecording
              ? "Tap to lock it in"
              : "Tap if the mic is shy"}
        </Text>
      </View>

      {transcribeOnly && lastTranscript && !isTranscribing ? (
        <View style={styles.captured}>
          <Text style={styles.capturedLabel}>IN THE PILE</Text>
          <Text style={styles.capturedText}>{lastTranscript}</Text>
        </View>
      ) : null}

      {!transcribeOnly && lastCaptured.length > 0 && !isTranscribing ? (
        <View style={styles.captured}>
          <Text style={styles.capturedLabel}>LOCKED IN</Text>
          {lastCaptured.map((item, index) => (
            <View key={`${index}-${item.title}`} style={styles.capturedItem}>
              <Text style={styles.capturedText}>{item.title}</Text>
              {(Array.isArray(item.nextSteps) ? item.nextSteps : []).slice(0, 3).map((step, stepIndex) => (
                <Text key={`${index}-step-${stepIndex}`} style={styles.capturedStep}>
                  {`• ${step}`}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 24,
    overflow: "hidden",
  },
  blobOne: {
    position: "absolute",
    top: -40,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#ff5a7a18",
  },
  blobTwo: {
    position: "absolute",
    bottom: 40,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#3ecfc118",
  },
  kicker: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.4,
    color: COLORS.accent,
    marginBottom: 6,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    color: COLORS.ink,
    letterSpacing: -1,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.inkDim,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 22,
    maxWidth: 280,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f5d5c4",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#ffffffcc",
  },
  modeChipOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + "18",
  },
  modeChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.inkDim,
  },
  modeChipTextOn: {
    color: COLORS.accent,
  },
  micCol: { alignItems: "center" },
  micStage: {
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  ripple: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  rippleMint: {
    borderColor: "#3ecfc1",
  },
  voiceGlow: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: COLORS.accent,
  },
  breatheHalo: {
    position: "absolute",
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: COLORS.accent + "22",
  },
  mic: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  micActive: { backgroundColor: COLORS.accentActive },
  micIcon: { fontSize: 42 },
  micLabel: {
    marginTop: -18,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.inkDim,
  },
  captured: {
    marginTop: 20,
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.accent + "33",
    backgroundColor: "#ffffffcc",
    padding: 16,
  },
  capturedLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.2,
    color: COLORS.accent,
    marginBottom: 6,
  },
  capturedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.ink,
    lineHeight: 22,
  },
  capturedItem: { marginTop: 10 },
  capturedStep: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.inkDim,
    lineHeight: 18,
    marginTop: 3,
  },
});
