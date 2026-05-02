import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetThoughtsStats, useGetActionsSummary, useListThoughts, useGetActionQueue } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  "side-projects": "Side Projects",
  family: "Family",
  finance: "Finance",
  personal: "Personal",
  health: "Health",
  other: "Other",
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const { data: stats, isLoading: statsLoading } = useGetThoughtsStats();
  const { data: summary, isLoading: summaryLoading } = useGetActionsSummary();
  const { data: recentThoughts, isLoading: thoughtsLoading } = useListThoughts({ limit: 3 });
  const { data: queue, isLoading: queueLoading } = useGetActionQueue();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const styles = makeStyles(colors, isDark);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topInset }]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 120 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day.</Text>
          <Text style={styles.subtitle}>Clear your mind.</Text>
        </View>
        <View style={[styles.logoMark, { backgroundColor: colors.primary }]}>
          <Feather name="zap" size={18} color="#fff" />
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Today"
          value={statsLoading ? "—" : String(stats?.recentCount ?? 0)}
          icon="brain"
          color={colors.primary}
          colors={colors}
          isDark={isDark}
        />
        <StatCard
          label="Pending"
          value={summaryLoading ? "—" : String(summary?.pending ?? 0)}
          icon="list"
          color={colors.secondary}
          colors={colors}
          isDark={isDark}
        />
        <StatCard
          label="Done"
          value={summaryLoading ? "—" : String(summary?.done ?? 0)}
          icon="check-circle"
          color="#16a34a"
          colors={colors}
          isDark={isDark}
        />
      </View>

      <SectionHeader title="Action Queue" onPress={() => router.push("/(tabs)/queue")} colors={colors} />
      {queueLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : queue?.queue.length === 0 ? (
        <EmptyState icon="inbox" message="Queue is clear" colors={colors} />
      ) : (
        <View style={styles.card}>
          {(queue?.queue ?? []).slice(0, 3).map((action, idx) => (
            <View key={action.id} style={[styles.queueItem, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.priorityDot, { backgroundColor: action.priority === "high" ? colors.priorityHighText : action.priority === "medium" ? colors.priorityMediumText : colors.priorityLowText }]} />
              <Text style={[styles.queueItemTitle, { color: colors.foreground }]} numberOfLines={1}>{action.title}</Text>
              <Text style={[styles.queueItemCat, { color: colors.mutedForeground }]}>{CATEGORY_LABELS[action.category] ?? action.category}</Text>
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="Recent Thoughts" onPress={() => router.push("/(tabs)/thoughts")} colors={colors} />
      {thoughtsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : recentThoughts?.thoughts.length === 0 ? (
        <EmptyState icon="feather" message="No thoughts captured yet" colors={colors} />
      ) : (
        <View style={styles.card}>
          {(recentThoughts?.thoughts ?? []).map((thought, idx) => (
            <View key={thought.id} style={[styles.thoughtItem, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.thoughtContent, { color: colors.foreground }]} numberOfLines={2}>{thought.content}</Text>
              <Text style={[styles.thoughtMeta, { color: colors.mutedForeground }]}>{CATEGORY_LABELS[thought.category] ?? thought.category} · {new Date(thought.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, icon, color, colors, isDark }: { label: string; value: string; icon: string; color: string; colors: ReturnType<typeof useColors>; isDark: boolean }) {
  return (
    <View style={[{ flex: 1, backgroundColor: isDark ? colors.card : colors.muted, borderRadius: 14, padding: 14, alignItems: "center", gap: 6 }]}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + "20", alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, onPress, colors }: { title: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 }}>
      <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{title}</Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium" }}>See all</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ icon, message, colors }: { icon: string; message: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}>
      <Feather name={icon as any} size={24} color={colors.mutedForeground} />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{message}</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingTop: 8 },
    greeting: { fontSize: 30, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    logoMark: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
    card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    queueItem: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 16, gap: 10 },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    queueItemTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
    queueItemCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
    thoughtItem: { paddingVertical: 13, paddingHorizontal: 16 },
    thoughtContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
    thoughtMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  });
}
