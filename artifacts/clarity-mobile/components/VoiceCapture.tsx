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
  TextInput,
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
  flushPendingCaptures,
  isNetworkCaptureError,
  isRetryableCaptureStatus,
  rememberPendingCapture,
  usePendingCaptureList,
} from "@/lib/pendingCaptures";
import {
  RECORD_OPTIONS,
  beginRecording,
  recorderIsLive,
  recordingTooShort,
  releaseAudioSession,
  stopActiveRecording,
  uploadCaptureAudio,
  uploadCaptureText,
} from "@/lib/recording";
import { createAudioLevelNormalizer } from "../../../lib/integrations/src/audioLevel";
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
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});
  /** Drive glow off the JS thread without re-rendering the whole Speak screen. */
  const energyAnim = useRef(new Animated.Value(0.22)).current;
  const levelRef = useRef(createAudioLevelNormalizer());
  const pending = usePendingCaptureList();

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

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const holdPendingCapture = useCallback(
    async (input: { text?: string; audioUri?: string; reason: "network" | "server" }) => {
      await rememberPendingCapture({ mode: captureModeRef.current, text: input.text, audioUri: input.audioUri });
      if (input.reason === "server") {
        Alert.alert(
          "Couldn't finish that",
          "Kept on this phone — Lock In will retry. Check Tasks in a moment.",
        );
        return;
      }
      Alert.alert(
        "Saved on this phone",
        input.text
          ? "I'll send what you said when you're back online."
          : "I'll send this recording when you're back online.",
      );
    },
    [],
  );

  const flushPending = useCallback(async () => {
    if (!apiKey.trim()) return;
    const apiBase = await resolveApiBase();
    const sent = await flushPendingCaptures(apiBase, apiKey);
    if (sent > 0) invalidateQueue();
  }, [apiKey, invalidateQueue]);

  useEffect(() => {
    if (!apiKey.trim() || pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await flushPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, flushPending, pending.length]);

  useEffect(() => {
    if (!apiKey.trim() || pending.length === 0) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void flushPending();
    });
    const timer = setInterval(() => {
      void flushPending();
    }, 20_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [apiKey, flushPending, pending.length]);

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
  }, [recorder, resetRecordingUi, withMicLock]);

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
      return;
    }

    if (recordingTooShort(capture.durationMillis)) {
      Alert.alert("Too short", "Speak for at least a second, then tap to save.");
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
        if (isRetryableCaptureStatus(res.status)) {
          await holdPendingCapture({ audioUri: capture.uri, reason: "server" });
          return;
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
    } catch (err) {
      if (isNetworkCaptureError(err)) {
        await holdPendingCapture({ audioUri: capture.uri, reason: "network" });
        return;
      }
      const message = err instanceof Error ? err.message : "Capture failed";
      if (/timed out|timeout|aborted/i.test(message)) {
        Alert.alert(
          "That took too long",
          "Check Tasks — it may already be there. Otherwise tap the mic and try again.",
        );
        invalidateQueue();
        return;
      }
      alertCaptureFailure(captureModeRef.current, 0, message);
    } finally {
      transcribingRef.current = false;
      setIsTranscribing(false);
    }
  }, [apiKey, holdPendingCapture, invalidateQueue, recorder, resetRecordingUi, withMicLock]);

  const captureFromText = useCallback(async (raw: string): Promise<boolean> => {
    const trimmed = raw.trim();
    if (!trimmed || transcribingRef.current) return false;
    if (!apiKey.trim()) {
      Alert.alert("Not signed in", "Log out and sign in again from Settings.");
      return false;
    }

    await stopOnly();
    transcribingRef.current = true;
    setIsTranscribing(true);
    try {
      const apiBase = await resolveApiBase();
      const mode = captureModeRef.current;
      const res = await uploadCaptureText(apiBase, apiKey, trimmed, mode);
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { error?: string };
          detail = body.error ?? "";
        } catch {
          detail = "";
        }
        if (isRetryableCaptureStatus(res.status)) {
          await holdPendingCapture({ text: trimmed, reason: "server" });
          return true;
        }
        alertCaptureFailure(mode, res.status, detail);
        return false;
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
      const text = json.transcript?.trim() || trimmed;
      if (mode === "transcribe") {
        if (!text && items.length === 0) {
          Alert.alert("Nothing captured", "Try a more specific note.");
          return false;
        }
        setLastTranscript(text);
        setLastCaptured(items);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateQueue();
        return true;
      }
      if (items.length === 0) {
        Alert.alert("Nothing captured", "Try a more specific to-do.");
        return false;
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
      }
      return true;
    } catch (err) {
      if (isNetworkCaptureError(err)) {
        await holdPendingCapture({ text: trimmed, reason: "network" });
        return true;
      }
      const message = err instanceof Error ? err.message : "Capture failed";
      if (/timed out|timeout|aborted/i.test(message)) {
        Alert.alert(
          "That took too long",
          "Check Tasks — it may already be there. Otherwise try again.",
        );
        invalidateQueue();
        return true;
      }
      alertCaptureFailure(captureModeRef.current, 0, message);
      return false;
    } finally {
      transcribingRef.current = false;
      setIsTranscribing(false);
    }
  }, [apiKey, holdPendingCapture, invalidateQueue, stopOnly]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        void stopOnly();
      };
    }, [stopOnly]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void stopOnly();
      }
    });
    return () => {
      sub.remove();
    };
  }, [stopOnly]);

  const onMicPress = () => {
    if (isTranscribing) return;
    const live = recordingRef.current || recorderIsLive(recorder);
    if (live) void stopAndTranscribe();
    else void startRecording();
  };

  useEffect(() => {
    if (!isRecording || isTranscribing) {
      levelRef.current.reset();
      energyAnim.setValue(0.22);
      return;
    }
    const id = setInterval(() => {
      try {
        const metering = recorder.getStatus().metering;
        const db = typeof metering === "number" && !Number.isNaN(metering) ? metering : -160;
        energyAnim.setValue(levelRef.current.fromDb(db));
      } catch {
        // recorder may be mid restart
      }
    }, 80);
    return () => clearInterval(id);
  }, [energyAnim, isRecording, isTranscribing, recorder]);

  return {
    isRecording,
    isTranscribing,
    lastCaptured,
    lastTranscript,
    pending,
    captureMode,
    setCaptureMode,
    onMicPress,
    captureFromText,
    energyAnim,
    stopOnly,
  };
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
  pendingLines?: string[];
  captureMode?: CaptureMode;
  onCaptureModeChange?: (mode: CaptureMode) => void;
  onMicPress: () => void;
  onTypedSubmit: (text: string) => Promise<boolean>;
  onDraftFocus?: () => void;
  energyAnim: Animated.Value;
};

export function VoiceCaptureHero({
  isRecording,
  isTranscribing,
  pendingLines = [],
  captureMode = "tasks",
  onCaptureModeChange,
  onMicPress,
  onTypedSubmit,
  onDraftFocus,
  energyAnim,
}: VoiceCaptureHeroProps) {
  const [draft, setDraft] = useState("");
  const transcribeOnly = captureMode === "transcribe";

  const submitDraft = async () => {
    const text = draft.trim();
    if (!text || isTranscribing) return;
    const ok = await onTypedSubmit(text);
    if (ok) setDraft("");
  };

  return (
    <View style={styles.hero}>
      <Text style={styles.brand}>Lock In</Text>
      <Text style={styles.sub}>
        {isTranscribing
          ? "Saving…"
          : isRecording
            ? "Listening — tap when you’re done"
            : "Speak or type a to-do"}
      </Text>
      {pendingLines.length > 0 ? (
        <Text style={styles.pending} numberOfLines={3}>
          {pendingLines.length === 1
            ? `Kept until online: ${pendingLines[0]}`
            : `${pendingLines.length} notes kept until you're online`}
        </Text>
      ) : null}
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
          {isTranscribing ? "Saving…" : isRecording ? "Tap to save" : "Tap to speak"}
        </Text>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a to-do…"
          placeholderTextColor={COLORS.inkDim}
          multiline
          editable={!isTranscribing}
          returnKeyType="done"
          blurOnSubmit
          onFocus={() => onDraftFocus?.()}
          onSubmitEditing={() => void submitDraft()}
        />
        <Pressable
          onPress={() => void submitDraft()}
          disabled={isTranscribing || !draft.trim()}
          style={({ pressed }) => [
            styles.addBtn,
            (!draft.trim() || isTranscribing) && styles.addBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: COLORS.ink,
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.inkDim,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  pending: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.ink,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f5d5c4",
    paddingHorizontal: 14,
    paddingVertical: 6,
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
  micCol: { alignItems: "center", marginTop: 8 },
  micStage: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  ripple: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  rippleMint: {
    borderColor: "#3ecfc1",
  },
  voiceGlow: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.accent,
  },
  breatheHalo: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.accent + "22",
  },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  micIcon: { fontSize: 34 },
  micLabel: {
    marginTop: -12,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.inkDim,
  },
  composer: {
    marginTop: 20,
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f5d5c4",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.ink,
    paddingVertical: 6,
  },
  addBtn: {
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
