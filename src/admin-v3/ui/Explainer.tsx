"use client";

import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Calculator, Info, Lightbulb, Scale, Sparkles } from "lucide-react";
import { Dialog } from "./Dialog";

/**
 * v3-native metric / lever explainer (CLAUDE.md Rule #12). Renders the five
 * required parts in the fixed order with the fixed labels:
 *   description → INSTITUTIONAL ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY.
 *
 * This is the admin-v3 counterpart to `src/components/admin/Explainers.tsx`
 * (which imports the v2 theme and is deleted at cutover). All five content
 * props are required, so a half-written explanation won't compile and no
 * surface can silently drop the institutional framing or reorder sections.
 */

function Rail({ accent, label, icon: Icon, children }: { accent: string; label: string; icon: ComponentType<{ style?: CSSProperties }>; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: "9px 11px", background: `color-mix(in oklab, ${accent} 9%, var(--av3-s1))`, borderLeft: `3px solid ${accent}`, borderRadius: 6, fontSize: 12.5, lineHeight: 1.55, color: "var(--av3-fg)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, display: "inline-flex", alignItems: "center", gap: 6, color: accent }}>
        <Icon style={{ width: 12, height: 12 }} /> {label}
      </div>
      {children}
    </div>
  );
}

export interface ExplainerProps {
  /** One-line definition — what this number is. */
  description: ReactNode;
  /** INSTITUTIONAL ANALYSIS — the analyst / CFO framing, benchmarks, the gate. */
  institutional: ReactNode;
  /** IN PLAIN TERMS — storytelling with a concrete złoty example. */
  plain: ReactNode;
  /** TIPS — HOW TO PUSH THIS LEVER — concrete operator actions. */
  tips: ReactNode;
  /** METHODOLOGY — HOW THIS IS DETERMINED — the formula / data source. */
  methodology: ReactNode;
}

export function MetricExplainer({ description, institutional, plain, tips, methodology }: ExplainerProps) {
  return (
    <>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{description}</p>
      <Rail accent="rgb(100,116,139)" label="Institutional analysis" icon={Scale}>{institutional}</Rail>
      <Rail accent="var(--av3-c5)" label="In plain terms" icon={Sparkles}>{plain}</Rail>
      <Rail accent="var(--av3-ok)" label="Tips — how to push this lever" icon={Lightbulb}>{tips}</Rail>
      <Rail accent="var(--av3-c3)" label="Methodology — how this is determined" icon={Calculator}>{methodology}</Rail>
    </>
  );
}

/** ⓘ trigger — opens a Dialog rendering the five-section MetricExplainer.
 *  Use on any KPI / lever that needs explaining (Rule #12). */
export function InfoButton({ title, ...explainer }: { title: string } & ExplainerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`About ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ display: "inline-grid", placeItems: "center", width: 15, height: 15, padding: 0, border: "none", background: "transparent", color: "var(--av3-subtle)", cursor: "pointer", flexShrink: 0 }}
      >
        <Info style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={title} subtitle="What it is · why it matters · how to move it" width={560}>
          <MetricExplainer {...explainer} />
        </Dialog>
      )}
    </>
  );
}
