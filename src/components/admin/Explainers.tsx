import { type ReactNode } from "react";
import { Sparkles, Lightbulb, Calculator, Scale } from "lucide-react";

/**
 * Plain-English explainer callout blocks, shared across the analytics
 * surfaces so they all read in one voice (the same orange/blue/green
 * left-rail vocabulary the Calculator at /admin/simulation uses):
 *   - InstitutionalAnalysis — the analyst/CFO framing
 *   - PlainTalk             — storytelling, złoty examples ("in plain terms")
 *   - Tips                  — what to actually do about it
 *   - Methodology           — how the number is computed
 *
 * Per CLAUDE.md Rule #12, every metric / lever ⓘ explanation is built from
 * `MetricExplainer` below, which fixes the section order and labels:
 * description → INSTITUTIONAL ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY.
 */

export function InstitutionalAnalysis({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(71, 85, 105, 0.06)", borderLeft: "3px solid rgb(71, 85, 105)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "rgb(30, 41, 59)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Scale style={{ width: 12, height: 12 }} aria-hidden /> Institutional analysis
      </div>
      {children}
    </div>
  );
}

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

export function Tips({ children, headline = "Tips — how to push this lever" }: { children: ReactNode; headline?: string }) {
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(22, 163, 74, 0.07)", borderLeft: "3px solid rgb(22, 163, 74)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "rgb(21, 128, 61)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Lightbulb style={{ width: 12, height: 12 }} aria-hidden /> {headline}
      </div>
      {children}
    </div>
  );
}

/**
 * The canonical metric / lever explanation (CLAUDE.md Rule #12). Renders the
 * five required parts in the fixed order with the fixed labels. Every ⓘ
 * InfoButton on a KPI card or lever must be built from this so the analytics
 * surfaces explain themselves in one consistent, complete voice.
 */
export function MetricExplainer({
  description,
  institutional,
  plain,
  tips,
  methodology,
}: {
  /** One-line definition — what this number is. */
  description: ReactNode;
  /** INSTITUTIONAL ANALYSIS — the analyst / CFO framing, benchmarks, what good looks like. */
  institutional: ReactNode;
  /** IN PLAIN TERMS — storytelling with a concrete złoty example. */
  plain: ReactNode;
  /** TIPS — HOW TO PUSH THIS LEVER — concrete operator actions. */
  tips: ReactNode;
  /** METHODOLOGY — HOW THIS IS DETERMINED — the formula / data source. */
  methodology: ReactNode;
}) {
  return (
    <>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{description}</p>
      <InstitutionalAnalysis>{institutional}</InstitutionalAnalysis>
      <PlainTalk>{plain}</PlainTalk>
      <Tips headline="Tips — how to push this lever">{tips}</Tips>
      <Methodology>{methodology}</Methodology>
    </>
  );
}
