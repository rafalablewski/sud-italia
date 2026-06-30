import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Theme-aware UI primitives shared by every screen — the native analogue of the
 * web glass-card / glass-btn / pill design language (DESIGN-SYSTEM.md). All
 * colours come from `useTheme()`, so the customer (parchment) and operator (dark)
 * skins reuse the exact same components.
 */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface2,
          borderColor: c.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  small,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  small?: boolean;
}) {
  const { c, radius } = useTheme();
  const bg = variant === "primary" ? c.accent : variant === "danger" ? c.danger : "transparent";
  const fg = variant === "ghost" ? c.textPrimary : c.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderRadius: radius.md,
        borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
        borderColor: c.line,
        paddingVertical: small ? 8 : 13,
        paddingHorizontal: small ? 14 : 18,
        alignItems: "center",
      })}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: small ? 14 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  active,
  tone,
  onPress,
}: {
  label: string;
  active?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onPress?: () => void;
}) {
  const { c, radius } = useTheme();
  const toneColor =
    tone === "success" ? c.success : tone === "warning" ? c.warning : tone === "danger" ? c.danger : tone === "info" ? c.accent : c.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? c.accent : "transparent",
        borderColor: active ? c.accent : c.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.pill,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {tone && !active && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: toneColor }} />}
      <Text style={{ color: active ? c.onAccent : c.textPrimary, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" }) {
  const { c, radius } = useTheme();
  const color = tone === "ok" ? c.success : tone === "warn" ? c.warning : tone === "bad" ? c.danger : c.textPrimary;
  return (
    <View
      style={{
        backgroundColor: c.surface2,
        borderColor: c.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        minWidth: 84,
        flexGrow: 1,
      }}
    >
      <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ color, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

export function SectionHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 4 }}>
      <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 }}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ color: c.textSecondary, fontSize: 13 }, style]}>{children}</Text>;
}

export function StateBlock({ kind, message }: { kind: "loading" | "empty" | "error"; message?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
      {kind === "loading" ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <Text style={{ fontSize: 28 }}>{kind === "error" ? "⚠️" : "—"}</Text>
      )}
      <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: "center", paddingHorizontal: 24 }}>
        {message ?? (kind === "loading" ? "Loading…" : kind === "error" ? "Something went wrong." : "Nothing here yet.")}
      </Text>
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginVertical: 8 }} />;
}
