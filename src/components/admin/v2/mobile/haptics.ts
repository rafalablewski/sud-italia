/**
 * Capability-gated haptic feedback. `navigator.vibrate` is supported on
 * Android Chrome and not iOS Safari; iOS gets a silent no-op. We never
 * vibrate without a user gesture having initiated the call to avoid
 * being flagged by browsers' user-gesture policy.
 */
type Strength = "light" | "medium" | "heavy" | "success" | "warning";

const PATTERNS: Record<Strength, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 24,
  success: [10, 30, 10],
  warning: [16, 40, 16],
};

export function haptic(strength: Strength = "light"): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[strength]);
  } catch {
    /* no-op — some browsers throw on cross-origin frames */
  }
}
