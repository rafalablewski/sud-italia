import { type ReactNode } from "react";
import { Sparkles, Lightbulb, Calculator, Scale } from "lucide-react";
import { Card, CardBody } from "@/ui";

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
 *
 * The page-level "How to read these numbers" / "How this projects" intro
 * card on each report + sandbox is built from `PageExplainer` (also below),
 * which renders the *same* five sections in the *same* order so the page
 * intro and the per-metric ⓘ dialog read as one voice. Both wrappers share
 * the identical required-prop shape — a half-written explanation won't
 * compile, and neither surface can silently drop the institutional framing
 * or reorder the sections.
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

/**
 * The canonical page-level explainer card — the "How to read these numbers" /
 * "How this projects" intro that sits below the KPI row on every report and
 * sandbox. It renders the SAME five sections as `MetricExplainer`, in the
 * SAME order and with the SAME labels (CLAUDE.md Rule #12), wrapped in a
 * `<Card>` with a heading + optional hint. Use this — never hand-assemble the
 * individual `PlainTalk` / `Methodology` / `Tips` blocks into a card — so the
 * page intro and the per-metric ⓘ dialogs stay unified. Its five content
 * props are all required, so a card can't ship missing the institutional
 * framing or with the sections out of order.
 */
export function PageExplainer({
  title = "How to read these numbers",
  hint,
  description,
  institutional,
  plain,
  tips,
  methodology,
}: {
  /** Card heading. Defaults to "How to read these numbers". */
  title?: ReactNode;
  /** Optional right-aligned hint shown next to the heading. */
  hint?: ReactNode;
  /** One-line framing of what the page/sandbox shows. */
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
    <Card>
      <CardBody>
        <div className="v2-detail-head">
          <h2>{title}</h2>
          {hint ? <span className="v2-detail-head-hint">{hint}</span> : null}
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
          {description}
        </p>
        <InstitutionalAnalysis>{institutional}</InstitutionalAnalysis>
        <PlainTalk>{plain}</PlainTalk>
        <Tips headline="Tips — how to push this lever">{tips}</Tips>
        <Methodology>{methodology}</Methodology>
      </CardBody>
    </Card>
  );
}
