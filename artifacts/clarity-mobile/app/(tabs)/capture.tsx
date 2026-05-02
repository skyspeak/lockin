import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
  Keyboard,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateThought, useCreateAction } from "@workspace/api-client-react";
import { getListThoughtsQueryKey, getGetThoughtsStatsQueryKey, getGetActionQueueQueryKey, getGetActionsSummaryQueryKey, getListActionsQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  { key: "work", label: "Work" },
  { key: "side-projects", label: "Side Projects" },
  { key: "family", label: "Family" },
  { key: "finance", label: "Finance" },
  { key: "personal", label: "Personal" },
  { key: "health", label: "Health" },
  { key: "other", label: "Other" },
] as const;

type Category = typeof CATEGORIES[number]["key"];
type Priority = "low" | "medium" | "high";
type CaptureMode = "thought" | "action";

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<CaptureMode>("thought");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("work");
  const [priority, setPriority] = useState<Priority>("medium");
  const inputRef = useRef<TextInput>(null);

  const createThought = useCreateThought();
  const createAction = useCreateAction();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();

    if (mode === "thought") {
      createThought.mutate(
        { data: { content: content.trim(), category } },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setContent("");
            queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
          },
          onError: () => {
            Alert.alert("Error", "Failed to save thought. Try again.");
          },
        }
      );
    } else {
      createAction.mutate(
        { data: { title: content.trim(), category, priority } },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setContent("");
            queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
          },
          onError: () => {
            Alert.alert("Error", "Failed to save action. Try again.");
          },
        }
      );
    }
  };

  const isPending = createThought.isPending || createAction.isPending;

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Capture</Text>
        <Text style={styles.subtitle}>{mode === "thought" ? "What's on your mind?" : "What needs to happen?"}</Text>
      </View>

      <View style={styles.modeToggle}>
        {(["thought", "action"] as CaptureMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => { setMode(m); Haptics.selectionAsync(); }}
            style={[styles.modeBtn, mode === m && { backgroundColor: colors.primary }]}
          >
            <Feather
              name={m === "thought" ? "zap" : "check-square"}
              size={14}
              color={mode === m ? "#fff" : colors.mutedForeground}
            />
            <Text style={[styles.modeBtnText, { color: mode === m ? "#fff" : colors.mutedForeground }]}>
              {m === "thought" ? "Thought" : "Action"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.foreground }]}
          placeholder={mode === "thought" ? "Type or dictate a thought..." : "What action do you need to take?"}
          placeholderTextColor={colors.mutedForeground}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus={false}
          returnKeyType="default"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              onPress={() => { setCategory(cat.key); Haptics.selectionAsync(); }}
              style={[styles.chip, { backgroundColor: category === cat.key ? colors.primary + "15" : colors.muted, borderColor: category === cat.key ? colors.primary : "transparent", borderWidth: 1 }]}
            >
              <Text style={[styles.chipText, { color: category === cat.key ? colors.primary : colors.mutedForeground }]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {mode === "action" && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Priority</Text>
          <View style={styles.chipRow}>
            {(["high", "medium", "low"] as Priority[]).map((p) => {
              const pColor = p === "high" ? colors.priorityHighText : p === "medium" ? colors.priorityMediumText : colors.priorityLowText;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { setPriority(p); Haptics.selectionAsync(); }}
                  style={[styles.chip, { backgroundColor: priority === p ? pColor + "15" : colors.muted, borderColor: priority === p ? pColor : "transparent", borderWidth: 1 }]}
                >
                  <Text style={[styles.chipText, { color: priority === p ? pColor : colors.mutedForeground, textTransform: "capitalize" }]}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: content.trim() ? colors.primary : colors.muted, opacity: isPending ? 0.7 : 1 }]}
        onPress={handleSubmit}
        disabled={!content.trim() || isPending}
        activeOpacity={0.8}
      >
        <Feather name={isPending ? "loader" : mode === "thought" ? "zap" : "plus"} size={18} color={content.trim() ? "#fff" : colors.mutedForeground} />
        <Text style={[styles.submitText, { color: content.trim() ? "#fff" : colors.mutedForeground }]}>
          {isPending ? "Saving..." : mode === "thought" ? "Capture Thought" : "Add to Queue"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
    header: { marginBottom: 20, paddingTop: 8 },
    title: { fontSize: 30, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    modeToggle: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: 12, padding: 4, marginBottom: 18, gap: 4 },
    modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
    modeBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    inputCard: { borderRadius: 16, borderWidth: 1, padding: 16, minHeight: 120, marginBottom: 20 },
    input: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 24, minHeight: 80 },
    section: { marginBottom: 20 },
    sectionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16, marginTop: 8 },
    submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  });
}
