import { Stack } from "expo-router";
import { ThemeProvider } from "@/theme/ThemeProvider";

/**
 * Operator app shell (OttavianoKDS) — always-dark kitchen skin. A plain Stack;
 * the nav rail is a slide-in drawer rendered by `<OperatorShell>` inside each
 * surface, so the full role-filtered IA (54 surfaces) is one tap away on every
 * screen. Auth gating lives in the routes (login / index / surface).
 */
export default function OperatorLayout() {
  return (
    <ThemeProvider skin="kds">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#15110d" } }} />
    </ThemeProvider>
  );
}
