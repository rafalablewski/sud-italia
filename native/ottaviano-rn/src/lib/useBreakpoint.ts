import { useWindowDimensions } from "react-native";

/**
 * Responsive breakpoints (ADR-002). Drives the mobile ⇄ desktop layout split so
 * the same screens render stacked (phone) or multi-column (Mac / iPad landscape,
 * mirroring the web page's placement). One source of truth for every screen.
 *
 *   mobile  < 700   — stacked, bottom-sheet cart
 *   tablet  700–1023 — roomier stacks
 *   desktop ≥ 1024  — multi-column console, persistent side panels (the web layout)
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

export function useBreakpoint(): { bp: Breakpoint; isDesktop: boolean; isTablet: boolean; width: number; height: number } {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint = width >= 1024 ? "desktop" : width >= 700 ? "tablet" : "mobile";
  return { bp, isDesktop: width >= 1024, isTablet: bp === "tablet", width, height };
}
