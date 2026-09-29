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
      await rememberPendingCapture({ mode: "tasks", text: input.text, audioUri: input.audioUri });
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
      const res = await uploadCaptureAudio(apiBase, apiKey, capture.uri, "tasks");
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
        alertCaptureFailure("tasks", res.status, detail);
        return;
      }
      const json = (await res.json()) as {
        transcript?: string;
        actions?: { title: string; nextSteps?: string[]; description?: string | null }[];
      };
      const items = (json.actions ?? [])
        .map((a) => ({ title: a.title, nextSteps: a.nextSteps ?? [] }))
        .filter((a) => a.title);
      if (items.length === 0) {
        Alert.alert("Nothing captured", "Try speaking again.");
        return;
      }

      setLastCaptured(items);
      setLastTranscript("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateQueue();
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
      alertCaptureFailure("tasks", 0, message);
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
    // Show the note in the hero immediately — server now ACKs before LLM work.
    const preview = [{ title: trimmed.slice(0, 120), nextSteps: ["Locking in…"] }];
    setLastCaptured(preview);
    setLastTranscript("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateQueue();

    transcribingRef.current = true;
    setIsTranscribing(true);
    try {
      const apiBase = await resolveApiBase();
      const res = await uploadCaptureText(apiBase, apiKey, trimmed, "tasks");
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
        setLastCaptured([]);
        alertCaptureFailure("tasks", res.status, detail);
        return false;
      }
      const json = (await res.json()) as {
        actions?: { title: string; nextSteps?: string[]; description?: string | null }[];
      };
      const items = (json.actions ?? [])
        .map((a) => ({ title: a.title, nextSteps: a.nextSteps ?? [] }))
        .filter((a) => a.title);
      if (items.length === 0) {
        setLastCaptured([]);
        Alert.alert("Nothing captured", "Try a more specific to-do.");
        return false;
      }
      setLastCaptured(items);
      invalidateQueue();
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
      setLastCaptured([]);
      alertCaptureFailure("tasks", 0, message);
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
    outputRange: [1, 1.04],
  });

  return (
    <>
      {rings.slice(0, 1).map((ring, index) => {
        const scale = ring.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.9],
        });
        const opacity = ring.interpolate({
          inputRange: [0, 0.25, 1],
          outputRange: [0.35, 0.2, 0],
        });
        return (
          <Animated.View
            key={index}
            pointerEvents="none"
            style={[styles.ripple, { transform: [{ scale }], opacity }]}
          />
        );
      })}
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
  onMicPress: () => void;
  onTypedSubmit: (text: string) => Promise<boolean>;
  onDraftFocus?: () => void;
  energyAnim: Animated.Value;
};

export function VoiceCaptureHero({
  isRecording,
  isTranscribing,
  pendingLines = [],
  onMicPress,
  onTypedSubmit,
  onDraftFocus,
  energyAnim,
}: VoiceCaptureHeroProps) {
  const [draft, setDraft] = useState("");

  const submitDraft = async () => {
    const text = draft.trim();
    if (!text || isTranscribing) return;
    // Clear immediately so Add feels instant; restore if the save fails.
    setDraft("");
    const ok = await onTypedSubmit(text);
    if (!ok) setDraft(text);
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
              <View style={[styles.micDot, isRecording && styles.micDotLive]} />
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
    fontSize: 28,
    color: COLORS.ink,
    letterSpacing: -0.5,
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
  micCol: { alignItems: "center", marginTop: 16 },
  micStage: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  ripple: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  breatheHalo: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.accent + "14",
  },
  mic: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  micActive: { backgroundColor: COLORS.accentActive },
  micDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  micDotLive: {
    width: 22,
    height: 14,
    borderRadius: 4,
  },
  micLabel: {
    marginTop: 4,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.inkDim,
  },
  composer: {
    marginTop: 24,
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 14,
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
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
