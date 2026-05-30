import { type ReactNode } from "react";
import { Sparkles, Lightbulb, Calculator } from "lucide-react";

/**
 * Plain-English explainer callout blocks, shared across the analytics
 * surfaces so they all read in one voice (the same orange/blue/green
 * left-rail vocabulary the Calculator at /admin/simulation uses):
 *   - PlainTalk   — storytelling, złoty examples ("in plain terms")
 *   - Methodology — how the number is computed
 *   - Tips        — what to actually do about it
 */

export function PlainTalk({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(234, 88, 12, 0.06)", borderLeft: "3px solid rgb(234, 88, 12)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "rgb(194, 65, 12)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Sparkles style={{ width: 12, height: 12 }} aria-hidden /> In plain terms
      </div>
      {children}
    </div>
  );
}

export function Methodology({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(59, 130, 246, 0.06)", borderLeft: "3px solid rgb(59, 130, 246)", borderRadius: 6, fontSize: 13, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "rgb(30, 64, 175)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Calculator style={{ width: 12, height: 12 }} aria-hidden /> Methodology — how this is determined
      </div>
      {children}
    </div>
  );
}

export function Tips({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(22, 163, 74, 0.07)", borderLeft: "3px solid rgb(22, 163, 74)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "rgb(21, 128, 61)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Lightbulb style={{ width: 12, height: 12 }} aria-hidden /> Tips — what to do
      </div>
      {children}
    </div>
  );
}
