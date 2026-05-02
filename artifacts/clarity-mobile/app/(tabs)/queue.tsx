import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useGetActionQueue, useUpdateAction, useGetActionsSummary } from "@workspace/api-client-react";
import { getGetActionQueueQueryKey, getGetActionsSummaryQueryKey, getListActionsQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Priority = "low" | "medium" | "high";

export default function QueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const queryClient = useQueryClient();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const { data, isLoading, refetch } = useGetActionQueue();
  const { data: summary } = useGetActionsSummary();
  const updateAction = useUpdateAction();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
  };

  const markDone = (id: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateAction.mutate({ id, data: { status: "done" } }, { onSuccess: invalidate });
  };

  const startAction = (id: number, currentStatus: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStatus = currentStatus === "in-progress" ? "pending" : "in-progress";
    updateAction.mutate({ id, data: { status: newStatus } }, { onSuccess: invalidate });
  };

  const styles = makeStyles(colors, isDark);
  const queue = data?.queue ?? [];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Action Queue</Text>
          {summary && (
            <Text style={styles.subtitle}>{summary.pending} pending · {summary.inProgress} in progress</Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Queue is clear</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Capture an action from the Capture tab.</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => String(item.id)}
          refreshing={isLoading}
          onRefresh={refetch}
          contentContainerStyle={{ paddingBottom: bottomInset + 120, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isInProgress = item.status === "in-progress";
            const priorityColor = item.priority === "high" ? colors.priorityHighText : item.priority === "medium" ? colors.priorityMediumText : colors.priorityLowText;

            return (
              <View style={[styles.actionCard, { backgroundColor: colors.card, borderColor: isInProgress ? colors.primary + "40" : colors.border }]}>
                <TouchableOpacity
                  onPress={() => markDone(item.id)}
                  style={[styles.checkBtn, { borderColor: isInProgress ? colors.primary : colors.border, backgroundColor: isInProgress ? colors.primary + "10" : "transparent" }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isInProgress && <Feather name="check" size={14} color={colors.primary} />}
                </TouchableOpacity>

                <View style={styles.actionBody}>
                  <Text style={[styles.actionTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                  {item.description && (
                    <Text style={[styles.actionDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{item.description}</Text>
                  )}
                  <View style={styles.actionMeta}>
                    <View style={[styles.badge, { backgroundColor: priorityColor + "15" }]}>
                      <Text style={[styles.badgeText, { color: priorityColor, textTransform: "capitalize" }]}>{item.priority}</Text>
                    </View>
                    <Text style={[styles.actionCat, { color: colors.mutedForeground }]}>{item.category.replace("-", " ")}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => startAction(item.id, item.status)}
                  style={styles.startBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather
                    name={isInProgress ? "pause-circle" : "play-circle"}
                    size={22}
                    color={isInProgress ? colors.primary : colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
    title: { fontSize: 30, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 80 },
    emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
    actionCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
    checkBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    actionBody: { flex: 1 },
    actionTitle: { fontSize: 15, fontFamily: "Inter_500Medium", lineHeight: 20 },
    actionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
    actionMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    actionCat: { fontSize: 11, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
    startBtn: { flexShrink: 0, padding: 2 },
  });
}
