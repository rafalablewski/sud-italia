"use client";

import Link from "next/link";
import { useState } from "react";
import { useSelection } from "./SelectionContext";

/**
 * Persistent Context Dock — the spine of the Service OS IA. Renders the
 * currently-selected entity's check as a floating glass peek that follows the
 * operator across every Core lens (Floor → Line → Pass → Book), so the check
 * is always one glance away. Tap the identity area to expand into the captured
 * line items (peek → expand). See docs/design-system/core/redesign/.
 *
 * ADDITIVE + zero-regression: renders `null` until something is selected, so
 * on surfaces where nothing is picked it contributes nothing. Styled with theme
 * tokens (--panel/--line/--sh-2) + backdrop-blur so it reads as glass under the
 * Liquid Glass skin and stays legible under Core Dark. Sits above the bottom
 * nav; fixed to the viewport (`.core` has no transformed ancestor). It never
 * fetches — it shows what the setting surface captured (fresh while that
 * surface polls; a snapshot once you navigate away).
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
  // Track which selection is expanded, so a new selection auto-collapses
  // (derived — no effect needed).
  const [openId, setOpenId] = useState<string | null>(null);

  if (!selected) return null;
  const tone = (selected.statusCls && toneVar[selected.statusCls]) || "var(--brand-bright, var(--brand))";
  const items = selected.items ?? [];
  const canExpand = items.length > 0;
  const open = openId === selected.id;

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
        borderRadius: 18,
        background: "var(--panel)",
        border: "1px solid var(--line-2)",
        boxShadow: "var(--sh-2), inset 0 1px 0 rgba(255,255,255,.18)",
        backdropFilter: "blur(22px) saturate(175%)",
        WebkitBackdropFilter: "blur(22px) saturate(175%)",
        color: "var(--ink)",
        overflow: "hidden",
        animation: "coreDockIn .32s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <style>{`@keyframes coreDockIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
      @media (prefers-reduced-motion: reduce){[aria-label="Selected check"]{animation:none!important}}`}</style>

      {/* peek row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px 12px 16px" }}>
        <span
          aria-hidden
          style={{ width: 10, height: 10, borderRadius: 999, background: tone, boxShadow: `0 0 10px ${tone}`, flex: "0 0 auto" }}
        />

        {/* identity — tap to expand when there are items */}
        <button
          type="button"
          onClick={() => canExpand && setOpenId(open ? null : selected.id)}
          aria-expanded={canExpand ? open : undefined}
          style={{
            minWidth: 0,
            flex: "0 1 auto",
            textAlign: "left",
            background: "none",
            border: 0,
            padding: 0,
            color: "inherit",
            cursor: canExpand ? "pointer" : "default",
            font: "inherit",
          }}
        >
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, letterSpacing: "-.01em", lineHeight: 1.15 }}>
            {selected.label}
            {selected.status ? (
              <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 11, color: tone }}>● {selected.status}</span>
            ) : null}
            {canExpand ? (
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-3)" }}>{open ? "▾" : "▸"}</span>
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
        </button>

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
          <Link href={selected.href} className="core-btn primary sm" style={{ flex: "0 0 auto", textDecoration: "none" }}>
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

      {/* expanded line items */}
      {open && canExpand ? (
        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px 14px", maxHeight: "40vh", overflow: "auto" }}>
          {items.map((it, i) => (
            <div
              key={`${it.label}-${i}`}
              style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, padding: "5px 0", color: "var(--ink-2)" }}
            >
              <span className="mono" style={{ color: "var(--brand-bright, var(--brand))", fontWeight: 700, minWidth: 26 }}>
                {it.qty}×
              </span>
              <span style={{ flex: 1, color: "var(--ink)" }}>
                {it.label}
                {it.note ? <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>· {it.note}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
