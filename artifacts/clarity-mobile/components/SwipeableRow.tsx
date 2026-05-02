import React, { useRef } from "react";
import { Animated, View, Text, StyleSheet, TouchableOpacity, I18nManager } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Feather } from "@expo/vector-icons";

interface Action {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftActions?: Action[];
  rightActions?: Action[];
}

function renderActions(
  actions: Action[],
  progress: Animated.AnimatedInterpolation<number>,
  side: "left" | "right"
) {
  const totalWidth = actions.length * 80;
  return (
    <View style={{ flexDirection: side === "right" ? "row-reverse" : "row", width: totalWidth }}>
      {actions.map((action, idx) => {
        const trans = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [side === "right" ? totalWidth : -totalWidth, 0],
        });
        return (
          <Animated.View
            key={idx}
            style={[
              styles.actionContainer,
              { backgroundColor: action.color, transform: [{ translateX: trans }] },
            ]}
          >
            <TouchableOpacity style={styles.actionButton} onPress={action.onPress}>
              <Feather name={action.icon as any} size={20} color="#fff" />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function SwipeableRow({ children, leftActions, rightActions }: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const close = () => swipeableRef.current?.close();

  const wrappedLeft = leftActions?.map((a) => ({ ...a, onPress: () => { close(); a.onPress(); } }));
  const wrappedRight = rightActions?.map((a) => ({ ...a, onPress: () => { close(); a.onPress(); } }));

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        wrappedLeft ? (progress) => renderActions(wrappedLeft, progress, "left") : undefined
      }
      renderRightActions={
        wrappedRight ? (progress) => renderActions(wrappedRight, progress, "right") : undefined
      }
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionContainer: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    alignItems: "center",
    gap: 4,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
