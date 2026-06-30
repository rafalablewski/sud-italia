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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderRadius: radius.md,
        borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
        borderColor: c.line,
        paddingVertical: small ? 10 : 14,
        paddingHorizontal: small ? 14 : 18,
        minHeight: small ? 40 : 48, // ≥44pt comfortable tap target
        alignItems: "center",
        justifyContent: "center",
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
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={onPress ? { selected: !!active } : undefined}
      accessibilityLabel={label}
      style={{
        backgroundColor: active ? c.accent : "transparent",
        borderColor: active ? c.accent : c.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.pill,
        paddingVertical: 8,
        paddingHorizontal: 13,
        minHeight: 36,
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

/** A small inline label chip (dietary / allergen / badge). Non-interactive,
 *  exposed to assistive tech as text. */
export function Badge({
  label,
  tone = "default",
  filled,
}: {
  label: string;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
  filled?: boolean;
}) {
  const { c, radius } = useTheme();
  const color =
    tone === "ok" ? c.success : tone === "warn" ? c.warning : tone === "danger" ? c.danger : tone === "brand" ? c.brand : c.textSecondary;
  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: filled ? color : "transparent",
        borderColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.pill,
        paddingVertical: 3,
        paddingHorizontal: 9,
      }}
    >
      <Text style={{ color: filled ? "#fff" : color, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

/** A horizontal segmented control (fulfilment toggle, tabs). Accessible:
 *  each segment is a radio in a radiogroup. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const { c, radius } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 11,
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: on ? c.accent : c.line,
              backgroundColor: on ? c.accent : "transparent",
            }}
          >
            <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "700", fontSize: 14 }}>{o.label}</Text>
            {o.sub ? <Text style={{ color: on ? c.onAccent : c.textSecondary, fontSize: 11, marginTop: 1 }}>{o.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quantity stepper (− n +) with proper a11y adjustable semantics. */
export function Stepper({
  value,
  onChange,
  min = 0,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
}) {
  const { c, radius } = useTheme();
  const Btn = ({ glyph, to, a11y }: { glyph: string; to: number; a11y: string }) => (
    <Pressable
      onPress={() => onChange(to)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surface }}
    >
      <Text style={{ color: c.accent, fontSize: 22, fontWeight: "800", lineHeight: 24 }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.pill, padding: 2 }}
    >
      <Btn glyph="−" to={Math.max(min, value - 1)} a11y="Decrease" />
      <Text style={{ color: c.textPrimary, fontWeight: "800", minWidth: 22, textAlign: "center", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Btn glyph="＋" to={value + 1} a11y="Increase" />
    </View>
  );
}

/** A thin progress rail (loyalty tier, combo progress, delivery threshold). */
export function ProgressBar({ fraction, tone = "accent" }: { fraction: number; tone?: "accent" | "success" | "warning" }) {
  const { c, radius } = useTheme();
  const fill = tone === "success" ? c.success : tone === "warning" ? c.warning : c.accent;
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surface, overflow: "hidden" }}
    >
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: fill, borderRadius: radius.pill }} />
    </View>
  );
}
