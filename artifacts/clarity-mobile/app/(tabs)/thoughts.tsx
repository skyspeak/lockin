import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  useColorScheme,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useListThoughts, useDeleteThought } from "@workspace/api-client-react";
import { getListThoughtsQueryKey, getGetThoughtsStatsQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "work", label: "Work" },
  { key: "side-projects", label: "Projects" },
  { key: "family", label: "Family" },
  { key: "finance", label: "Finance" },
  { key: "personal", label: "Personal" },
  { key: "health", label: "Health" },
] as const;

type Category = Exclude<typeof CATEGORIES[number]["key"], "all">;

export default function ThoughtsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const params: Record<string, unknown> = { limit: 100 };
  if (activeCategory !== "all") params.category = activeCategory;
  if (search.trim()) params.search = search.trim();

  const { data, isLoading, refetch } = useListThoughts(params as Parameters<typeof useListThoughts>[0]);
  const deleteThought = useDeleteThought();

  const handleDelete = (id: number, content: string) => {
    Alert.alert("Delete thought?", content.slice(0, 60) + (content.length > 60 ? "..." : ""), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteThought.mutate({ id }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
            },
          });
        },
      },
    ]);
  };

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Thoughts</Text>
        <Text style={styles.subtitle}>{data?.total ?? 0} captured</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search thoughts..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => { setActiveCategory(item.key); Haptics.selectionAsync(); }}
            style={[styles.filterChip, { backgroundColor: activeCategory === item.key ? colors.primary : colors.muted }]}
          >
            <Text style={[styles.filterChipText, { color: activeCategory === item.key ? "#fff" : colors.mutedForeground }]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (data?.thoughts.length ?? 0) === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="feather" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No thoughts here</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Capture one from the Capture tab.</Text>
        </View>
      ) : (
        <FlatList
          data={data?.thoughts ?? []}
          keyExtractor={(item) => String(item.id)}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 120 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.thoughtCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.thoughtBody}>
                <Text style={[styles.thoughtContent, { color: colors.foreground }]}>{item.content}</Text>
                <View style={styles.thoughtMeta}>
                  <View style={[styles.catBadge, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.catBadgeText, { color: colors.mutedForeground, textTransform: "capitalize" }]}>{item.category.replace("-", " ")}</Text>
                  </View>
                  <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.content)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="trash-2" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
    title: { fontSize: 30, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
    filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 80 },
    emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
    thoughtCard: { flexDirection: "row", alignItems: "flex-start", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    thoughtBody: { flex: 1 },
    thoughtContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
    thoughtMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    catBadgeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
    timestamp: { fontSize: 11, fontFamily: "Inter_400Regular" },
    deleteBtn: { padding: 4, marginLeft: 8 },
  });
}
