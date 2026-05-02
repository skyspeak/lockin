import React, { useState, useRef, useCallback } from "react";
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
  Animated,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateThought, useCreateAction } from "@workspace/api-client-react";
import {
  getListThoughtsQueryKey,
  getGetThoughtsStatsQueryKey,
  getGetActionQueueQueryKey,
  getGetActionsSummaryQueryKey,
  getListActionsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  { key: "work", label: "Work" },
  { key: "side-projects", label: "Projects" },
  { key: "family", label: "Family" },
  { key: "finance", label: "Finance" },
  { key: "personal", label: "Personal" },
  { key: "health", label: "Health" },
  { key: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];
type Priority = "low" | "medium" | "high";
type CaptureMode = "thought" | "action";

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string }> = {
  high: { bg: "#fef2f2", text: "#dc2626" },
  medium: { bg: "#fffbeb", text: "#d97706" },
  low: { bg: "#f0fdf4", text: "#16a34a" },
};

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<CaptureMode>("thought");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("work");
  const [priority, setPriority] = useState<Priority>("medium");
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const successScale = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const createThought = useCreateThought();
  const createAction = useCreateAction();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const switchMode = useCallback(
    (m: CaptureMode) => {
      if (m === mode) return;
      Haptics.selectionAsync();
      Animated.spring(slideAnim, {
        toValue: m === "action" ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
      setMode(m);
    },
    [mode, slideAnim]
  );

  const triggerSuccess = () => {
    setShowSuccess(true);
    Animated.sequence([
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.delay(900),
      Animated.spring(successScale, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }),
    ]).start(() => setShowSuccess(false));
  };

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
            triggerSuccess();
            queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
          },
          onError: () => Alert.alert("Error", "Failed to save thought. Try again."),
        }
      );
    } else {
      createAction.mutate(
        { data: { title: content.trim(), category, priority } },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setContent("");
            triggerSuccess();
            queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
          },
          onError: () => Alert.alert("Error", "Failed to save action. Try again."),
        }
      );
    }
  };

  const isPending = createThought.isPending || createAction.isPending;
  const canSubmit = content.trim().length > 0;
  const styles = makeStyles(colors, isDark);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: topInset }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 100 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Capture</Text>
          <Text style={styles.subtitle}>
            {mode === "thought" ? "What's on your mind?" : "What needs to happen?"}
          </Text>
        </View>

        <View style={[styles.segmentWrapper, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.segmentIndicator,
              {
                backgroundColor: colors.card,
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
                left: mode === "thought" ? 4 : "50%",
              },
            ]}
          />
          {(["thought", "action"] as CaptureMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => switchMode(m)}
              style={styles.segmentBtn}
              activeOpacity={0.8}
            >
              <Feather
                name={m === "thought" ? "zap" : "check-square"}
                size={14}
                color={mode === m ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.segmentBtnText,
                  { color: mode === m ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {m === "thought" ? "Thought" : "Action"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={[
            styles.inputCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder={
              mode === "thought"
                ? "Type a thought..."
                : "What action do you need to take?"
            }
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.inputFooter}>
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
              {content.length > 0 ? `${content.length} chars` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => { setCategory(cat.key); Haptics.selectionAsync(); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? colors.primary + "12" : colors.muted,
                      borderColor: isActive ? colors.primary : "transparent",
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isActive ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {mode === "action" && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.priorityRow}>
              {(["high", "medium", "low"] as Priority[]).map((p) => {
                const pColors = isDark
                  ? {
                      high: { bg: "#7f1d1d40", text: "#f87171" },
                      medium: { bg: "#78350f40", text: "#fbbf24" },
                      low: { bg: "#14532d40", text: "#4ade80" },
                    }
                  : PRIORITY_COLORS;
                const isActive = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => { setPriority(p); Haptics.selectionAsync(); }}
                    style={[
                      styles.priorityBtn,
                      {
                        backgroundColor: isActive ? pColors[p].bg : colors.muted,
                        borderColor: isActive ? pColors[p].text + "60" : "transparent",
                        borderWidth: 1,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: isActive ? pColors[p].text : colors.mutedForeground,
                      }}
                    />
                    <Text
                      style={[
                        styles.priorityBtnText,
                        {
                          color: isActive ? pColors[p].text : colors.mutedForeground,
                          textTransform: "capitalize",
                        },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            {
              backgroundColor: canSubmit ? colors.primary : colors.muted,
              opacity: isPending ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || isPending}
          activeOpacity={0.85}
        >
          <Feather
            name={isPending ? "loader" : mode === "thought" ? "zap" : "plus"}
            size={18}
            color={canSubmit ? "#fff" : colors.mutedForeground}
          />
          <Text
            style={[styles.submitText, { color: canSubmit ? "#fff" : colors.mutedForeground }]}
          >
            {isPending
              ? "Saving..."
              : mode === "thought"
              ? "Capture Thought"
              : "Add to Queue"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {showSuccess && (
        <Animated.View
          style={[
            styles.successToast,
            {
              backgroundColor: colors.card,
              transform: [{ scale: successScale }],
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 4 },
            },
          ]}
          pointerEvents="none"
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#16a34a20", alignItems: "center", justifyContent: "center" }}>
            <Feather name="check" size={20} color="#16a34a" />
          </View>
          <Text style={[styles.successText, { color: colors.foreground }]}>Saved!</Text>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { marginBottom: 20, paddingTop: 8 },
    title: {
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
    segmentWrapper: {
      flexDirection: "row",
      borderRadius: 12,
      padding: 4,
      marginBottom: 18,
      position: "relative",
      height: 46,
    },
    segmentIndicator: {
      position: "absolute",
      top: 4,
      width: "49%",
      bottom: 4,
      borderRadius: 9,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      zIndex: 1,
    },
    segmentBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    inputCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 8,
      minHeight: 130,
      marginBottom: 22,
    },
    input: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      lineHeight: 26,
      minHeight: 88,
    },
    inputFooter: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingTop: 6,
    },
    charCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
    section: { marginBottom: 22 },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    chipRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 22,
      borderWidth: 1,
    },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    priorityRow: { flexDirection: "row", gap: 10 },
    priorityBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
    },
    priorityBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 17,
      borderRadius: 16,
      marginTop: 4,
    },
    submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
    successToast: {
      position: "absolute",
      alignSelf: "center",
      top: "40%",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      paddingVertical: 24,
      paddingHorizontal: 36,
      borderRadius: 20,
      zIndex: 100,
    },
    successText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  });
}
