"use client";

import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";

interface Props {
  /** Modal title. */
  title: string;
  /** Modal body — supports prose JSX. */
  children: ReactNode;
  /** Accessible label for the trigger. Defaults to "What is this?". */
  label?: string;
  /** Icon size: "sm" (12 px) for inline labels, "md" (14 px) for card headers. */
  size?: "sm" | "md";
}

/**
 * Small info "i" button. Click opens a Dialog with an amateur-friendly
 * explanation of the concept. The Dialog uses createPortal under the
 * hood (per project Rule #4), so the popup is safe inside cards with
 * stacking contexts.
 */
export function InfoButton({ title, children, label = "What is this?", size = "md" }: Props) {
  const [open, setOpen] = useState(false);
  const px = size === "sm" ? 12 : 14;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="v2-info-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: px + 8,
          height: px + 8,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--fg-muted)",
          cursor: "pointer",
          padding: 0,
          lineHeight: 0,
          verticalAlign: "middle",
        }}
      >
        <Info style={{ width: px, height: px }} aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="md">
        <div className="v2-info-body" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg)" }}>
          {children}
        </div>
      </Dialog>
    </>
  );
}
