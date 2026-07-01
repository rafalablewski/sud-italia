"use client";

import Link from "next/link";
import { useSelection } from "./SelectionContext";

/**
 * Persistent Context Dock — the spine of the Service OS IA. Renders the
 * currently-selected entity's check as a floating glass peek that follows the
 * operator across every Core lens (Floor → Line → Pass → Book), so the check
 * is always one glance away. See docs/design-system/core/redesign/.
 *
 * ADDITIVE + zero-regression: renders `null` until something is selected, so
 * on surfaces where nothing is picked it contributes nothing. Styled with theme
 * tokens (--panel/--line/--sh-2) + backdrop-blur so it reads as glass under the
 * Liquid Glass skin and stays legible under Core Dark. Sits above the bottom
 * nav; fixed to the viewport (`.core` has no transformed ancestor).
 */
const toneVar: Record<string, string> = {
  seated: "var(--brand-bright, var(--brand))",
  freeing: "var(--amber)",
  booked: "var(--info)",
  oos: "var(--ink-3)",
  available: "var(--basil)",
};

export function CoreDock() {
  const { selected, clear } = useSelection();
  if (!selected) return null;
  const tone = (selected.statusCls && toneVar[selected.statusCls]) || "var(--brand-bright, var(--brand))";

  return (
    <div
      role="region"
      aria-label="Selected check"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 84,
        zIndex: 20,
        width: "min(720px, calc(100% - 24px))",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px 12px 16px",
        borderRadius: 18,
        background: "var(--panel)",
        border: "1px solid var(--line-2)",
        boxShadow: "var(--sh-2), inset 0 1px 0 rgba(255,255,255,.18)",
        backdropFilter: "blur(22px) saturate(175%)",
        WebkitBackdropFilter: "blur(22px) saturate(175%)",
        color: "var(--ink)",
        animation: "coreDockIn .32s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <style>{`@keyframes coreDockIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
      @media (prefers-reduced-motion: reduce){[aria-label="Selected check"]{animation:none!important}}`}</style>

      {/* status dot */}
      <span
        aria-hidden
        style={{ width: 10, height: 10, borderRadius: 999, background: tone, boxShadow: `0 0 10px ${tone}`, flex: "0 0 auto" }}
      />

      {/* identity */}
      <div style={{ minWidth: 0, flex: "0 1 auto" }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, letterSpacing: "-.01em", lineHeight: 1.15 }}>
          {selected.label}
          {selected.status ? (
            <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 11, color: tone }}>● {selected.status}</span>
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selected.sub}
          {selected.note ? (
            <span style={{ marginLeft: 8, color: selected.allergy ? "var(--amber)" : "var(--ink-3)", fontWeight: selected.allergy ? 700 : 400 }}>
              {selected.allergy ? "⚠ " : "📝 "}
              {selected.note}
            </span>
          ) : null}
        </div>
      </div>

      {/* amount */}
      {selected.amount ? (
        <div
          className="mono"
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontWeight: 700,
            fontSize: 15,
            color: selected.amountDue ? "var(--brand-bright, var(--brand))" : "var(--basil)",
            whiteSpace: "nowrap",
          }}
        >
          {selected.amount}
        </div>
      ) : (
        <div style={{ marginLeft: "auto" }} />
      )}

      {/* actions */}
      {selected.href ? (
        <Link
          href={selected.href}
          className="core-btn primary sm"
          style={{ flex: "0 0 auto", textDecoration: "none" }}
        >
          Open
        </Link>
      ) : null}
      <button
        type="button"
        onClick={clear}
        aria-label="Dismiss selection"
        title="Dismiss"
        style={{
          flex: "0 0 auto",
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "var(--panel-3)",
          border: "1px solid var(--line)",
          color: "var(--ink-2)",
          fontSize: 15,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
