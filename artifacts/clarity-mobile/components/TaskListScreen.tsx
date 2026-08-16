import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SectionList, Swipeable } from "react-native-gesture-handler";
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
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApiKey } from "@/components/AuthContext";
import { getApiBasePath, resolveDefaultApiOrigin } from "@/constants/api";

const COLORS = {
  bg: "#fdfbf7",
  ink: "#1a1715",
  inkDim: "#7a716b",
  hairline: "#ebe5dd",
  card: "#ffffff",
  accent: "#c8553d",
  green: "#5d7a4a",
  red: "#c0392b",
};

const SERVER_STORAGE_KEY = "clarity_api_server_url";

type Action = {
  id: number;
  title: string;
  status: string;
  priority: string;
  category?: string;
  nextSteps?: string[];
};

const CATEGORY_ORDER = ["work", "family", "hobbies", "extracurriculars", "other"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  family: "Family",
  hobbies: "Hobbies",
  extracurriculars: "Extracurriculars",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  work: { bg: "#dbeafe", text: "#1e40af" },
  family: { bg: "#fef3c7", text: "#92400e" },
  hobbies: { bg: "#ede9fe", text: "#6d28d9" },
  extracurriculars: { bg: "#ccfbf1", text: "#134e4a" },
  other: { bg: "#f3f4f6", text: "#374151" },
};

async function resolveApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
  const origin = stored || resolveDefaultApiOrigin();
  return getApiBasePath(origin);
}

export function TaskListScreen() {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();
  const queueUrl = getGetActionQueueUrl();
  const { data, refetch, isLoading } = useGetActionQueue();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();
  const [refiningId, setRefiningId] = useState<number | null>(null);
  const [isRefining, setIsRefining] = useState(false);

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const queue = (data?.queue ?? []) as Action[];
  const sections = useMemo(() => {
    const sorted = [...queue].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf((a.category ?? "other") as (typeof CATEGORY_ORDER)[number]);
      const bi = CATEGORY_ORDER.indexOf((b.category ?? "other") as (typeof CATEGORY_ORDER)[number]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const grouped: Array<{ title: string; data: Action[] }> = [];
    for (const item of sorted) {
      const category = item.category ?? "other";
      const last = grouped[grouped.length - 1];
      if (last && last.title === category) {
        last.data.push(item);
      } else {
        grouped.push({ title: category, data: [item] });
      }
    }
    return grouped;
  }, [queue]);

  const handleComplete = useCallback(
    async (id: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateAction.mutateAsync({ id, data: { status: "done" } });
      invalidateQueue();
    },
    [updateAction, invalidateQueue],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteAction.mutateAsync({ id });
      invalidateQueue();
    },
    [deleteAction, invalidateQueue],
  );

  const stopAndRefine = useCallback(
    async (id: number) => {
      try {
        await recorder.stop();
        setRefiningId(null);
        const uri = recorder.uri;
        if (!uri) return;

        setIsRefining(true);
        const form = new FormData();
        const ext = uri.split(".").pop() || "m4a";
        const mime = ext === "m4a" ? "audio/m4a" : `audio/${ext}`;
        // @ts-ignore
        form.append("audio", { uri, name: `audio.${ext}`, type: mime });

        const apiBase = await resolveApiBase();
        const res = await fetch(`${apiBase}/actions/${id}/refine`, {
          method: "POST",
          body: form,
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          let detail = "Couldn't refine that";
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) detail = body.error;
          } catch {
            detail = `Server returned ${res.status}`;
          }
          Alert.alert("Refine failed", detail);
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateQueue();
      } catch {
        Alert.alert("Refine failed", "Please try speaking again.");
      } finally {
        setIsRefining(false);
      }
    },
    [apiKey, invalidateQueue, recorder],
  );

  const handleRefine = useCallback(
    async (id: number) => {
      if (isRefining) return;
      if (refiningId === id) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await stopAndRefine(id);
        return;
      }

      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          Alert.alert("Mic unavailable", "Please grant microphone permission in Settings.");
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (refiningId != null) {
          await recorder.stop().catch(() => {});
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRefiningId(id);
      } catch {
        Alert.alert("Mic unavailable", "Please grant microphone permission in Settings.");
      }
    },
    [isRefining, recorder, refiningId, stopAndRefine],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.sub}>
          {queue.length === 0
            ? "Speak on the home tab to add tasks"
            : "Swipe right to finish · swipe left to delete"}
        </Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No tasks yet. Go to Speak and say something.</Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>
            {CATEGORY_LABELS[section.title] ?? section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const category = item.category ?? "other";
          const chip = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
          const listening = refiningId === item.id;
          return (
            <View style={styles.swipeWrap}>
              <Swipeable
                friction={2}
                leftThreshold={64}
                rightThreshold={64}
                overshootLeft={false}
                overshootRight={false}
                onSwipeableLeftOpen={() => {
                  void handleComplete(item.id);
                }}
                onSwipeableRightOpen={() => {
                  void handleDelete(item.id);
                }}
                renderLeftActions={() => (
                  <View style={[styles.swipeFill, styles.swipeDone]}>
                    <Text style={styles.swipeLabel}>Done</Text>
                  </View>
                )}
                renderRightActions={() => (
                  <View style={[styles.swipeFill, styles.swipeDelete]}>
                    <Text style={styles.swipeLabel}>Delete</Text>
                  </View>
                )}
              >
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={4}>
                      {item.title}
                    </Text>
                    <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                      <Text style={[styles.chipText, { color: chip.text }]}>
                        {CATEGORY_LABELS[category] ?? category}
                      </Text>
                    </View>
                  </View>
                  {(item.nextSteps ?? []).map((step) => (
                    <Text key={step} style={styles.nextStep}>
                      {`• ${step}`}
                    </Text>
                  ))}
                  <Pressable
                    onPress={() => void handleRefine(item.id)}
                    disabled={isRefining && !listening}
                    style={({ pressed }) => [
                      styles.refineBtn,
                      listening && styles.refineBtnActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.refineText, listening && styles.refineTextActive]}>
                      {isRefining && listening
                        ? "Refining…"
                        : listening
                          ? "Tap to stop"
                          : "Refine"}
                    </Text>
                  </Pressable>
                </View>
              </Swipeable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.ink },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.inkDim, marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  swipeWrap: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  swipeFill: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  swipeDone: { backgroundColor: COLORS.green, alignItems: "flex-start" },
  swipeDelete: { backgroundColor: COLORS.red, alignItems: "flex-end" },
  swipeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 16,
  },
  cardTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: COLORS.ink,
    lineHeight: 22,
    flex: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  nextStep: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.inkDim,
    lineHeight: 18,
    marginBottom: 4,
  },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase" },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.inkDim,
    marginBottom: 8,
    marginTop: 8,
    backgroundColor: COLORS.bg,
  },
  refineBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent + "44",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  refineBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  refineText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
  refineTextActive: { color: "#fff" },
  empty: { paddingVertical: 60, alignItems: "center", paddingHorizontal: 32 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    color: COLORS.inkDim,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
