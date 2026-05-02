import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useGetThoughtsStats,
  useGetActionsSummary,
  useListThoughts,
  useGetActionQueue,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListThoughtsQueryKey,
  getGetThoughtsStatsQueryKey,
  getGetActionQueueQueryKey,
  getGetActionsSummaryQueryKey,
} from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  "side-projects": "Side Projects",
  family: "Family",
  finance: "Finance",
  personal: "Personal",
  health: "Health",
  other: "Other",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetThoughtsStats();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetActionsSummary();
  const { data: recentThoughts, isLoading: thoughtsLoading, refetch: refetchThoughts } = useListThoughts({ limit: 3 });
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useGetActionQueue();

  const isRefreshing = statsLoading || summaryLoading || thoughtsLoading || queueLoading;

  const onRefresh = async () => {
    await Promise.all([refetchStats(), refetchSummary(), refetchThoughts(), refetchQueue()]);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const styles = makeStyles(colors, isDark);

  const priorityItems = (queue?.queue ?? []).slice(0, 3);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topInset }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.subtitle}>Clear your mind. Organize your day.</Text>
        </View>
        <View style={[styles.logoMark, { backgroundColor: colors.primary }]}>
          <Feather name="zap" size={18} color="#fff" />
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Captured Today"
          value={statsLoading ? "–" : String(stats?.recentCount ?? 0)}
          icon="cpu"
          color={colors.primary}
          colors={colors}
        />
        <StatCard
          label="Pending"
          value={summaryLoading ? "–" : String(summary?.pending ?? 0)}
          icon="list"
          color={colors.secondary}
          colors={colors}
        />
        <StatCard
          label="Done"
          value={summaryLoading ? "–" : String(summary?.done ?? 0)}
          icon="check-circle"
          color="#16a34a"
          colors={colors}
        />
      </View>

      <TouchableOpacity
        style={[styles.capturePrompt, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push("/(tabs)/capture")}
        activeOpacity={0.85}
      >
        <Feather name="edit-3" size={15} color={colors.mutedForeground} />
        <Text style={[styles.capturePromptText, { color: colors.mutedForeground }]}>
          What's on your mind?
        </Text>
        <View style={[styles.captureChip, { backgroundColor: colors.primary }]}>
          <Text style={styles.captureChipText}>Capture</Text>
        </View>
      </TouchableOpacity>

      <SectionHeader
        title="Action Queue"
        count={summary?.pending}
        onPress={() => router.push("/(tabs)/queue")}
        colors={colors}
      />
      {queueLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : priorityItems.length === 0 ? (
        <EmptyCard icon="inbox" message="Queue is clear — nice work." colors={colors} />
      ) : (
        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {priorityItems.map((action, idx) => {
            const pColor =
              action.priority === "high"
                ? colors.priorityHighText
                : action.priority === "medium"
                ? colors.priorityMediumText
                : colors.priorityLowText;
            return (
              <View
                key={action.id}
                style={[
                  styles.listRow,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.priorityBar, { backgroundColor: pColor }]} />
                <Text style={[styles.listRowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text style={[styles.listRowMeta, { color: colors.mutedForeground }]}>
                  {CATEGORY_LABELS[action.category] ?? action.category}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <SectionHeader
        title="Recent Thoughts"
        onPress={() => router.push("/(tabs)/thoughts")}
        colors={colors}
      />
      {thoughtsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : (recentThoughts?.thoughts.length ?? 0) === 0 ? (
        <EmptyCard icon="feather" message="No thoughts captured yet." colors={colors} />
      ) : (
        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(recentThoughts?.thoughts ?? []).map((thought, idx) => (
            <View
              key={thought.id}
              style={[
                styles.thoughtRow,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.thoughtContent, { color: colors.foreground }]} numberOfLines={2}>
                {thought.content}
              </Text>
              <Text style={[styles.thoughtMeta, { color: colors.mutedForeground }]}>
                {CATEGORY_LABELS[thought.category] ?? thought.category}
                {" · "}
                {new Date(thought.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 14,
        alignItems: "flex-start",
        gap: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: color + "18",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <View>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            lineHeight: 30,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            marginTop: 2,
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  count,
  onPress,
  colors,
}: {
  title: string;
  count?: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 30, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
          {title}
        </Text>
        {count !== undefined && count > 0 && (
          <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 11, color: "#fff", fontFamily: "Inter_600SemiBold" }}>{count}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={onPress} style={{ paddingLeft: 8 }}>
        <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>See all</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyCard({ icon, message, colors }: { icon: string; message: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 32,
        gap: 8,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderStyle: "dashed",
        backgroundColor: colors.muted,
      }}
    >
      <Feather name={icon as any} size={22} color={colors.mutedForeground} />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
        {message}
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 22,
      paddingTop: 8,
    },
    greeting: {
      fontSize: 32,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 3,
    },
    logoMark: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
    capturePrompt: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 13,
      gap: 10,
      marginBottom: 4,
    },
    capturePromptText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
    captureChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    captureChipText: { fontSize: 12, color: "#fff", fontFamily: "Inter_600SemiBold" },
    listCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 13,
      paddingHorizontal: 16,
      gap: 10,
    },
    priorityBar: { width: 3, height: 18, borderRadius: 2, flexShrink: 0 },
    listRowTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
    listRowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
    thoughtRow: { paddingVertical: 13, paddingHorizontal: 16 },
    thoughtContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
    thoughtMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  });
}
