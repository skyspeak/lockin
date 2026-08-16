import { useEffect } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useListFollowUpPlans } from "@workspace/api-client-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const COLORS = {
  bg: "#fdfbf7",
  ink: "#1a1715",
  inkDim: "#7a716b",
  hairline: "#ebe5dd",
  card: "#ffffff",
  accent: "#c8553d",
  green: "#5d7a4a",
  amber: "#b8862c",
  red: "#c0392b",
};

export default function FollowUpsTab() {
  const { data, isLoading, refetch, isRefetching } = useListFollowUpPlans();
  const plans = data?.plans ?? [];
  const hasGenerating = plans.some((p) => p.status === "generating");

  useEffect(() => {
    if (!hasGenerating) return;
    const timer = setInterval(() => void refetch(), 3000);
    return () => clearInterval(timer);
  }, [hasGenerating, refetch]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Follow-ups</Text>
        <Text style={styles.sub}>Next steps generated from what you said</Text>
      </View>
      <FlatList
        data={plans}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Capture a task by voice and next steps will appear here.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.actionTitle}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            {item.summary ? (
              <Text style={styles.summary} numberOfLines={2}>
                {item.summary}
              </Text>
            ) : null}
            <Text style={styles.date}>{timeAgo(item.createdAt)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    generating: COLORS.amber,
    ready: COLORS.green,
    failed: COLORS.red,
  };
  return (
    <Text style={[styles.badge, { color: colors[status] ?? COLORS.inkDim }]}>
      {status}
    </Text>
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
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  cardTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: COLORS.ink,
    lineHeight: 21,
  },
  badge: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "capitalize" },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.inkDim,
    lineHeight: 20,
    marginBottom: 8,
  },
  date: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.inkDim },
  empty: { paddingVertical: 60, paddingHorizontal: 32, alignItems: "center" },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.inkDim,
    textAlign: "center",
    lineHeight: 22,
  },
});
