import React, { useState, useCallback } from "react";
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
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useListThoughts, useDeleteThought } from "@workspace/api-client-react";
import {
  getListThoughtsQueryKey,
  getGetThoughtsStatsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { SwipeableRow } from "@/components/SwipeableRow";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "work", label: "Work" },
  { key: "side-projects", label: "Projects" },
  { key: "family", label: "Family" },
  { key: "finance", label: "Finance" },
  { key: "personal", label: "Personal" },
  { key: "health", label: "Health" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  work: "#3b82f6",
  "side-projects": "#8b5cf6",
  family: "#ec4899",
  finance: "#10b981",
  personal: "#f59e0b",
  health: "#ef4444",
  other: "#6b7280",
};

export default function ThoughtsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const params: Record<string, unknown> = { limit: 100 };
  if (activeCategory !== "all") params.category = activeCategory;
  if (search.trim()) params.search = search.trim();

  const { data, isLoading, refetch } = useListThoughts(
    params as Parameters<typeof useListThoughts>[0]
  );
  const deleteThought = useDeleteThought();

  const handleDelete = useCallback(
    (id: number, content: string) => {
      Alert.alert(
        "Delete thought?",
        content.slice(0, 80) + (content.length > 80 ? "…" : ""),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              deleteThought.mutate(
                { id },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
                  },
                }
              );
            },
          },
        ]
      );
    },
    [deleteThought, queryClient]
  );

  const styles = makeStyles(colors);
  const thoughts = data?.thoughts ?? [];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Thoughts</Text>
          <Text style={styles.subtitle}>{data?.total ?? 0} captured</Text>
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.muted }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search thoughts..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && Platform.OS !== "ios" && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x-circle" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14, gap: 8 }}
        renderItem={({ item }) => {
          const isActive = activeCategory === item.key;
          const dotColor = item.key === "all" ? colors.primary : CATEGORY_COLORS[item.key] ?? colors.primary;
          return (
            <TouchableOpacity
              onPress={() => {
                setActiveCategory(item.key);
                Haptics.selectionAsync();
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? colors.primary : colors.muted,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              {item.key !== "all" && (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isActive ? "#fff" : dotColor,
                  }}
                />
              )}
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? "#fff" : colors.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : thoughts.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="feather" size={28} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No thoughts here</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            {search
              ? `No results for "${search}"`
              : "Capture one from the Capture tab."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={thoughts}
          keyExtractor={(item) => String(item.id)}
          onRefresh={refetch}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 100,
            paddingTop: 2,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const dotColor = CATEGORY_COLORS[item.category] ?? colors.mutedForeground;
            return (
              <View style={{ marginBottom: 10, borderRadius: 16, overflow: "hidden" }}>
                <SwipeableRow
                  rightActions={[
                    {
                      label: "Delete",
                      icon: "trash-2",
                      color: "#dc2626",
                      onPress: () => handleDelete(item.id, item.content),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.thoughtCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.thoughtBody}>
                      <Text style={[styles.thoughtContent, { color: colors.foreground }]}>
                        {item.content}
                      </Text>
                      <View style={styles.thoughtMeta}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <View
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 3.5,
                              backgroundColor: dotColor,
                            }}
                          />
                          <Text
                            style={[
                              styles.catText,
                              { color: colors.mutedForeground, textTransform: "capitalize" },
                            ]}
                          >
                            {item.category.replace("-", " ")}
                          </Text>
                        </View>
                        <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
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

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
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
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      marginHorizontal: 20,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === "ios" ? 11 : 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      padding: 0,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 20,
    },
    filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
    thoughtCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderWidth: StyleSheet.hairlineWidth,
      padding: 15,
    },
    thoughtBody: { flex: 1 },
    thoughtContent: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
    },
    thoughtMeta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    catText: { fontSize: 12, fontFamily: "Inter_400Regular" },
    timestamp: { fontSize: 11, fontFamily: "Inter_400Regular" },
  });
}
