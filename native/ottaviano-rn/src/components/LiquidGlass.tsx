import React, { type ReactNode } from "react";
import { requireNativeComponent, Platform, View, type ViewProps, type HostComponent } from "react-native";

// JS side of the bridged native SwiftUI Liquid Glass element (ADR-001). Renders
// the real iOS 26 `.glassEffect` material behind its RN children (a stock
// material on iOS < 26). Off iOS — or if the native view isn't registered — it
// degrades to a plain <View>, so the same JSX is safe everywhere.

interface LiquidGlassProps extends ViewProps {
  /** Corner radius of the glass panel. */
  glassCornerRadius?: number;
  /** Glass variant — "regular" (default) or "clear". */
  glassVariant?: "regular" | "clear";
  children?: ReactNode;
}

let Native: HostComponent<LiquidGlassProps> | null = null;
if (Platform.OS === "ios") {
  try {
    Native = requireNativeComponent<LiquidGlassProps>("LiquidGlassView");
  } catch {
    Native = null; // native module not present in this build — fall back gracefully
  }
}

export function LiquidGlass({
  glassCornerRadius = 14,
  glassVariant = "regular",
  style,
  children,
  ...rest
}: LiquidGlassProps) {
  if (!Native) {
    // Fallback: a plain rounded container so layout is identical without the glass.
    return (
      <View style={[{ borderRadius: glassCornerRadius, overflow: "hidden" }, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <Native glassCornerRadius={glassCornerRadius} glassVariant={glassVariant} style={style} {...rest}>
      {children}
    </Native>
  );
}
