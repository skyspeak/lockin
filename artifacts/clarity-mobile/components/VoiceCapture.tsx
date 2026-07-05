import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useCreateAction, getGetActionQueueUrl } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiKey } from "@/components/AuthContext";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  bg: "#fdfbf7",
  ink: "#1a1715",
  inkDim: "#7a716b",
  accent: "#c8553d",
  accentActive: "#a8412e",
};

const SERVER_STORAGE_KEY = "clarity_api_server_url";

async function resolveApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
  const origin = stored || resolveDefaultApiOrigin();
  return getApiBasePath(origin);
};

export function useVoiceCapture() {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();
  const queueUrl = getGetActionQueueUrl();
  const createAction = useCreateAction();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const startRecording = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert("Mic unavailable", "Please grant microphone permission in Settings.");
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await recorder.stop();
      setIsRecording(false);
      const uri = recorder.uri;
      if (!uri) return;

      setIsTranscribing(true);

      const form = new FormData();
      const ext = uri.split(".").pop() || "m4a";
      const mime = ext === "m4a" ? "audio/m4a" : `audio/${ext}`;
      // @ts-ignore
      form.append("audio", { uri, name: `audio.${ext}`, type: mime });

      const apiBase = await resolveApiBase();
      const res = await fetch(`${apiBase}/transcribe`, {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error("transcription failed");
      const json = (await res.json()) as { text: string };
      const text = json.text?.trim();
      if (!text) {
        Alert.alert("Nothing captured", "Try speaking again.");
        return;
      }

      await createAction.mutateAsync({ data: { title: text, priority: "medium" } });
      setLastCaptured(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateQueue();
    } catch {
      Alert.alert("Couldn't transcribe", "Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  }, [apiKey, createAction, invalidateQueue, recorder]);

  const onMicPress = isRecording ? stopAndTranscribe : startRecording;

  return {
    isRecording,
    isTranscribing,
    lastCaptured,
    onMicPress,
  };
}

type VoiceCaptureHeroProps = {
  isRecording: boolean;
  isTranscribing: boolean;
  lastCaptured: string | null;
  onMicPress: () => void;
};

export function VoiceCaptureHero({
  isRecording,
  isTranscribing,
  lastCaptured,
  onMicPress,
}: VoiceCaptureHeroProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.hero}>
      <Text style={styles.kicker}>VOICE FIRST</Text>
      <Text style={styles.brand}>Clarity</Text>
      <Text style={styles.sub}>Speak a task. It lands on your list.</Text>

      <View style={styles.micWrap}>
        {isRecording && (
          <Animated.View
            style={[styles.pulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
          />
        )}
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
            <Text style={styles.micIcon}>{isRecording ? "■" : "🎤"}</Text>
          )}
        </Pressable>
        <Text style={styles.micLabel}>
          {isTranscribing ? "Transcribing…" : isRecording ? "Tap to stop" : "Tap to speak"}
        </Text>
      </View>

      {lastCaptured && !isRecording && !isTranscribing ? (
        <View style={styles.captured}>
          <Text style={styles.capturedLabel}>JUST ADDED</Text>
          <Text style={styles.capturedText}>{lastCaptured}</Text>
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
  },
  kicker: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.inkDim,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 36,
    lineHeight: 22,
  },
  micWrap: { alignItems: "center", justifyContent: "center" },
  pulse: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.accent,
  },
  mic: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  micActive: { backgroundColor: COLORS.accentActive },
  micIcon: { fontSize: 44 },
  micLabel: {
    marginTop: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.inkDim,
  },
  captured: {
    marginTop: 28,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.accent + "33",
    backgroundColor: COLORS.accent + "10",
    padding: 16,
  },
  capturedLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.accent,
    marginBottom: 6,
  },
  capturedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.ink,
    lineHeight: 22,
  },
});
