import React, { useCallback, useState } from "react";
import {
  Alert,
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
  useGetActionQueue,
  useUpdateAction,
  useDeleteAction,
  useSnoozeAction,
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = {
  bg: "#fdfbf7",
  ink: "#1a1715",
  inkDim: "#7a716b",
  hairline: "#ebe5dd",
  card: "#ffffff",
  accent: "#c8553d",
  green: "#5d7a4a",
  blue: "#3a6b8a",
  amber: "#b8862c",
  red: "#c0392b",
};

type Action = {
  id: number;
  title: string;
  status: string;
  priority: string;
};

export function TaskListScreen() {
  const queryClient = useQueryClient();
  const queueUrl = getGetActionQueueUrl();
  const { data, refetch, isLoading } = useGetActionQueue();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();
  const snoozeAction = useSnoozeAction();
  const [refreshing, setRefreshing] = useState(false);

  const invalidateQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queueUrl] });
  }, [queryClient, queueUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const queue = (data?.queue ?? []) as Action[];

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
      Alert.alert("Delete this task?", undefined, [
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
    Linking.openURL(`mailto:?body=${body}`).catch(() => {});
  }, []);

  const handleText = useCallback((title: string) => {
    const body = encodeURIComponent(title);
    const url = Platform.OS === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.sub}>
          {queue.length === 0
            ? "Speak on the home tab to add tasks"
            : `${queue.length} ${queue.length === 1 ? "task" : "tasks"} in your queue`}
        </Text>
      </View>
      <FlatList
        data={queue}
        keyExtractor={(item) => String(item.id)}
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={4}>
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
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.ink },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.inkDim, marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.hairline,
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
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  empty: { paddingVertical: 60, alignItems: "center", paddingHorizontal: 32 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    color: COLORS.inkDim,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
