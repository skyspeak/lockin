import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useGetActionQueue, useUpdateAction, useGetActionsSummary } from "@workspace/api-client-react";
import {
  getGetActionQueueQueryKey,
  getGetActionsSummaryQueryKey,
  getListActionsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { SwipeableRow } from "@/components/SwipeableRow";

type FilterMode = "all" | "pending" | "in-progress";

const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in-progress", label: "In Progress" },
];

export default function QueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>("all");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useGetActionQueue();
  const { data: summary } = useGetActionsSummary();
  const updateAction = useUpdateAction();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
  }, [queryClient]);

  const markDone = useCallback(
    (id: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateAction.mutate({ id, data: { status: "done" } }, { onSuccess: invalidate });
    },
    [invalidate, updateAction]
  );

  const dismiss = useCallback(
    (id: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateAction.mutate({ id, data: { status: "dismissed" } }, { onSuccess: invalidate });
    },
    [invalidate, updateAction]
  );

  const toggleProgress = useCallback(
    (id: number, currentStatus: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newStatus = currentStatus === "in-progress" ? "pending" : "in-progress";
      updateAction.mutate({ id, data: { status: newStatus } }, { onSuccess: invalidate });
    },
    [invalidate, updateAction]
  );

  const styles = makeStyles(colors, isDark);
  const allQueue = data?.queue ?? [];
  const queue =
    filter === "all" ? allQueue : allQueue.filter((a) => a.status === filter);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Action Queue</Text>
          {summary && (
            <Text style={styles.subtitle}>
              {summary.pending} pending · {summary.inProgress} in progress
            </Text>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => {
              setFilter(key);
              Haptics.selectionAsync();
            }}
            style={[
              styles.filterBtn,
              {
                backgroundColor: filter === key ? colors.primary : colors.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterBtnText,
                { color: filter === key ? "#fff" : colors.mutedForeground },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : queue.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {filter === "all" ? "Queue is clear" : `No ${filter.replace("-", " ")} actions`}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            {filter === "all"
              ? "Capture actions from the Capture tab."
              : "Switch filter to see other items."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 20,
            paddingTop: 4,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isInProgress = item.status === "in-progress";
            const priorityColor =
              item.priority === "high"
                ? colors.priorityHighText
                : item.priority === "medium"
                ? colors.priorityMediumText
                : colors.priorityLowText;

            return (
              <View style={{ marginBottom: 10, borderRadius: 16, overflow: "hidden" }}>
                <SwipeableRow
                  leftActions={[
                    {
                      label: "Done",
                      icon: "check",
                      color: "#16a34a",
                      onPress: () => markDone(item.id),
                    },
                  ]}
                  rightActions={[
                    {
                      label: "Dismiss",
                      icon: "x",
                      color: "#dc2626",
                      onPress: () => dismiss(item.id),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.actionCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: isInProgress ? colors.primary + "50" : colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusIndicator,
                        {
                          backgroundColor: isInProgress ? colors.primary : colors.border,
                        },
                      ]}
                    />

                    <View style={styles.actionBody}>
                      <Text
                        style={[styles.actionTitle, { color: colors.foreground }]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {item.description ? (
                        <Text
                          style={[styles.actionDesc, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {item.description}
                        </Text>
                      ) : null}
                      <View style={styles.actionMeta}>
                        <View
                          style={[
                            styles.priorityBadge,
                            { backgroundColor: priorityColor + "18" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.priorityBadgeText,
                              { color: priorityColor, textTransform: "capitalize" },
                            ]}
                          >
                            {item.priority}
                          </Text>
                        </View>
                        <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>
                          {item.category.replace("-", " ")}
                        </Text>
                        {isInProgress && (
                          <View style={[styles.inProgressBadge, { backgroundColor: colors.primary + "12" }]}>
                            <Text style={{ fontSize: 10, color: colors.primary, fontFamily: "Inter_500Medium" }}>
                              In Progress
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => toggleProgress(item.id, item.status)}
                      style={[
                        styles.playBtn,
                        {
                          backgroundColor: isInProgress
                            ? colors.primary + "15"
                            : colors.muted,
                        },
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather
                        name={isInProgress ? "pause" : "play"}
                        size={14}
                        color={isInProgress ? colors.primary : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  </View>
                </SwipeableRow>
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
    header: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      paddingTop: 8,
    },
    title: {
      fontSize: 32,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 3,
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    filterBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    filterBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingBottom: 100,
    },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingHorizontal: 40,
      lineHeight: 20,
    },
    actionCard: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
      gap: 12,
      backgroundColor: "white",
    },
    statusIndicator: { width: 3, height: 36, borderRadius: 2, flexShrink: 0 },
    actionBody: { flex: 1 },
    actionTitle: { fontSize: 15, fontFamily: "Inter_500Medium", lineHeight: 21 },
    actionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
    actionMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
    priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    priorityBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    categoryText: { fontSize: 11, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
    inProgressBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    playBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
  });
}
