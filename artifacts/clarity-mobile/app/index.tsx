import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import {
  useGetActionQueue,
  useUpdateAction,
  useDeleteAction,
  useSnoozeAction,
  useCreateAction,
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = {
  bg: "#fdfbf7",
  ink: "#1a1715",
  inkDim: "#7a716b",
  hairline: "#ebe5dd",
  card: "#ffffff",
  accent: "#c8553d", // terracotta
  accentSoft: "#fbeae5",
  green: "#5d7a4a",
  greenSoft: "#e8efe1",
  blue: "#3a6b8a",
  amber: "#b8862c",
  red: "#c0392b",
};

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

type Action = {
  id: number;
  title: string;
  description?: string | null;
  status: "pending" | "in-progress" | "done" | "dismissed";
  priority: "low" | "medium" | "high";
  snoozedUntil?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function HomeScreen() {
  const queryClient = useQueryClient();
  const queueUrl = getGetActionQueueUrl();
  const { data, refetch, isLoading } = useGetActionQueue();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();
  const snoozeAction = useSnoozeAction();
  const createAction = useCreateAction();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

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

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const startRecording = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (e) {
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
      // @ts-ignore — RN FormData accepts {uri,name,type}
      form.append("audio", { uri, name: `audio.${ext}`, type: mime });

      const res = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: form });
      if (!res.ok) throw new Error("transcription failed");
      const json = (await res.json()) as { text: string };
      const text = json.text?.trim();
      if (!text) {
        Alert.alert("Nothing captured", "I didn't catch that — try again.");
        return;
      }

      await createAction.mutateAsync({ data: { title: text, priority: "medium" } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateQueue();
    } catch (e) {
      Alert.alert("Couldn't transcribe", "Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  }, [recorder, createAction, invalidateQueue]);

  const onMicPress = isRecording ? stopAndTranscribe : startRecording;

  const handleComplete = useCallback(
    async (id: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateAction.mutateAsync({ id, data: { status: "done" } });
      invalidateQueue();
    },
    [updateAction, invalidateQueue],
  );

  const doSnooze = useCallback(
    async (id: number, days: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await snoozeAction.mutateAsync({ id, data: { days } });
      invalidateQueue();
    },
    [snoozeAction, invalidateQueue],
  );

  const handleSnooze = useCallback(
    (id: number) => {
      Alert.alert("Snooze for…", undefined, [
        { text: "1 day", onPress: () => doSnooze(id, 1) },
        { text: "1 week", onPress: () => doSnooze(id, 7) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [doSnooze],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Delete this action?", undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAction.mutateAsync({ id });
            invalidateQueue();
          },
        },
      ]);
    },
    [deleteAction, invalidateQueue],
  );

  const handleEmail = useCallback((title: string) => {
    const body = encodeURIComponent(title);
    const gmail = `googlegmail://co?body=${body}`;
    const mailto = `mailto:?body=${body}`;
    Linking.canOpenURL(gmail).then((ok) => {
      Linking.openURL(ok ? gmail : mailto).catch(() => Linking.openURL(mailto));
    });
  }, []);

  const handleText = useCallback((title: string) => {
    const body = encodeURIComponent(title);
    const url = Platform.OS === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  const queue = (data?.queue ?? []) as Action[];

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Clarity</Text>
        <Text style={styles.sub}>
          {queue.length === 0
            ? "Nothing on your mind."
            : `${queue.length} ${queue.length === 1 ? "thing" : "things"} to do`}
        </Text>
      </View>

      <View style={styles.micWrap}>
        {isRecording && (
          <Animated.View
            style={[
              styles.pulse,
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]}
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
            <Text style={styles.micIcon}>{isRecording ? "■" : "●"}</Text>
          )}
        </Pressable>
        <Text style={styles.micLabel}>
          {isTranscribing ? "Transcribing…" : isRecording ? "Tap to stop" : "Tap to speak"}
        </Text>
      </View>

      <FlatList
        data={queue}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Speak something to capture your first action.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={3}>
              {item.title}
            </Text>
            <View style={styles.row}>
              <ActionBtn label="Done" tint={COLORS.green} onPress={() => handleComplete(item.id)} />
              <ActionBtn label="Email" tint={COLORS.blue} onPress={() => handleEmail(item.title)} />
              <ActionBtn label="Text" tint={COLORS.accent} onPress={() => handleText(item.title)} />
              <ActionBtn label="Snooze" tint={COLORS.amber} onPress={() => handleSnooze(item.id)} />
              <ActionBtn label="Delete" tint={COLORS.red} onPress={() => handleDelete(item.id)} />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function ActionBtn({ label, tint, onPress }: { label: string; tint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: tint + "33" },
        pressed && { backgroundColor: tint + "14" },
      ]}
    >
      <Text style={[styles.btnText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  brand: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.ink, letterSpacing: -0.5 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.inkDim, marginTop: 2 },
  micWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 28 },
  pulse: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.accent,
  },
  mic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  micActive: { backgroundColor: "#a8412e" },
  micIcon: { color: "#fff", fontSize: 44, lineHeight: 48 },
  micLabel: {
    marginTop: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.inkDim,
    letterSpacing: 0.2,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    position: "relative",
  },
  cardTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: COLORS.ink,
    lineHeight: 22,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 6 },
  btn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  empty: { paddingVertical: 60, alignItems: "center" },
  emptyText: {
    fontFamily: "Inter_400Regular",
    color: COLORS.inkDim,
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
