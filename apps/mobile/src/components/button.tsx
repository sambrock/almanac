import { useTheme } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

export function Button({
  title,
  onPress,
  disabled = false,
  variant = "filled",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "filled" | "plain";
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "filled" && { backgroundColor: colors.primary },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={[styles.title, { color: variant === "filled" ? "white" : colors.primary }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dimmed: {
    opacity: 0.5,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
});
