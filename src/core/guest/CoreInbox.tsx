"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreCrumb } from "@/core/shell/CoreCrumb";
import { CoreSectionHead } from "@/core/shell/CoreSectionHead";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { guestTabs } from "./guestTabs";
import { GuestGlyph } from "./glyphs";

/** One itemised live-order line, if the sessions API ever exposes the cart
 *  breakdown (today it returns only count + subtotal — see DATA NEEDED). */
interface OrderLine {
  name: string;
  qty: number;
  priceGrosze: number;
}
interface WaSessionRow {
  phone: string;
  locationSlug: "krakow" | "warszawa" | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  customerName: string | null;
  fulfillmentType: "takeout" | "delivery" | null;
  pendingOrderId: string | null;
  pendingPaymentUrl: string | null;
  items?: OrderLine[];
  lastTurnAt: string;
  simulated: boolean;
}
interface TranscriptHead {
  phone: string;
  lastAt: string;
  lastBody: string;
  messageCount: number;
  hasInbound: boolean;
}
interface ConversationRow {
  phone: string;
  lastAt: string;
  customerName: string | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  fulfillmentType: "takeout" | "delivery" | null;
  pendingOrderId: string | null;
  pendingPaymentUrl: string | null;
  items?: OrderLine[];
  messageCount: number;
  lastBody: string;
  hasInbound: boolean;
  hasActiveSession: boolean;
}
interface WaMessage {
  at: string;
  direction: "in" | "out";
  body: string;
  actor: "customer" | "bot" | "operator" | "system";
  kind?: "text" | "selection" | "location" | "buttons" | "list" | "cta_url" | "template" | "unsupported";
  meta?: Record<string, unknown>;
}
interface GuestRollup {
  name: string | null;
  /** Loyalty metal (Gold / …). Not returned by the customer endpoint today, so
   *  it is null until a computed tier is exposed there — see DATA NEEDED. */
  tier: string | null;
  ltv: number;
  visits: number;
  isMember: boolean;
  memberSince: string | null;
}
/** A concierge Next-Best-Action for the selected guest. There is no source for
 *  these yet (see DATA NEEDED); the card structure renders 1:1 once one exists. */
interface Nba {
  kind: string;
  title: string;
  rationale: string;
  message: string;
}
interface Metrics {
  windows: { last7d: { orders: { paid: number }; conversionRate: number } };
  activeSessions: { totalSessions: number; awaitingPayment: number; cartHasItems: number };
  historicConversations: number;
  /** Optional — rendered when the metrics endpoint starts supplying them
   *  (see DATA NEEDED); until then the cells fall back to a muted em dash. */
  responseTimeMinutes?: number | null;
  optInRate?: number | null;
}
type Filter = "all" | "unread" | "live" | "archived";

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 86400) return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return `${Math.floor(diff / 86400)}d`;
}
function initials(name: string | null, phone: string): string {
  if (name) return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return phone.slice(-2);
}
// Whole-złoty formatter (pl-PL groups thousands with a space): "1 240".
function plInt(grosze: number): string {
  return Math.round(grosze / 100).toLocaleString("pl-PL");
}
// Deterministic avatar tint so a given phone always draws the same colour.
const AV_VARIANTS = ["brand", "basil", "info", "amber"] as const;
function avatarVariant(phone: string): (typeof AV_VARIANTS)[number] {
  let h = 0;
  for (let i = 0; i < phone.length; i++) h = (h * 31 + phone.charCodeAt(i)) >>> 0;
  return AV_VARIANTS[h % AV_VARIANTS.length];
}
// Mask the middle of a phone for the guest-context read ("+48 512 ••• 340").
function maskPhone(phone: string): string {
  const d = phone.replace(/\s+/g, "");
  if (d.length < 6) return phone;
  const last3 = d.slice(-3);
  let head = d.slice(0, Math.min(6, d.length - 3));
  if (head.startsWith("+") && head.length >= 6) head = `${head.slice(0, 3)} ${head.slice(3)}`;
  return `${head} ••• ${last3}`;
}
// Order/session refs are slugs (e.g. "demo-wa-ord-2wjcko"); the mockup shows a
// short clean ref (e.g. "#4821"), so surface only the trailing token, upper-cased
// and capped, wherever a ref is badged.
function shortRef(id: string): string {
  const tail = id.split(/[-_]/).pop() || id;
  return tail.slice(-6).toUpperCase();
}
// Loyalty metal → tier-badge colour class (gold gradient is the default).
function tierClass(tier: string | null): string {
  const t = (tier ?? "").toLowerCase();
  if (t.includes("platinum")) return "platinum";
  if (t.includes("silver")) return "silver";
  if (t.includes("bronze")) return "bronze";
  return "gold";
}
interface CardRow { label: string; value: string; tone?: string }
// Structured order/product card carried on a message's meta, rendered in-bubble.
// Shape (see DATA NEEDED): meta.card = [{ label|l, value|v, tone? }, …].
function messageCard(m: WaMessage): CardRow[] | null {
  const raw = (m.meta as Record<string, unknown> | undefined)?.card;
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        label: String(o.label ?? o.l ?? ""),
        value: String(o.value ?? o.v ?? ""),
        tone: typeof o.tone === "string" ? o.tone : undefined,
      };
    })
    .filter((r) => r.label || r.value);
  return rows.length ? rows : null;
}
// Named-actor label + WhatsApp actor group for a message bubble.
function actorLabel(m: WaMessage): { group: string; label: string } {
  const meta = m.meta as Record<string, unknown> | undefined;
  const staff = typeof meta?.staffName === "string" ? meta.staffName : typeof meta?.actorName === "string" ? meta.actorName : null;
  switch (m.actor) {
    case "customer": return { group: "guest", label: "Guest" };
    case "bot": return { group: "bot", label: "Concierge bot" };
    case "system": return { group: "system", label: "System" };
    case "operator":
    default: return { group: "staff", label: staff ? `${staff} · staff` : "You" };
  }
}
// Non-text message kinds get a small badge so the operator sees the interaction
// type (a template send, an interactive menu, a shared pin) at a glance.
const KIND_BADGE: Record<string, string> = {
  template: "Template",
  buttons: "Buttons",
  list: "List",
  cta_url: "Link",
  location: "📍 Location",
  selection: "Selection",
  unsupported: "Unsupported",
};
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface FunnelStage { stage: string; label: string; count: number; pctOfStart: number; pctOfPrev: number; dropFromPrev: number }
interface FunnelData { startedCount: number; paidCount: number; conversionRate: number; uniqueConversations: number; stages: FunnelStage[] }
type FunnelWindow = "7d" | "30d" | "all";

// Operator quick-reply starters (mockup phrasings). "Share live order link"
// injects the live pay/order URL; the rest are canned openers. `tone: "b"`
// tints the chip basil, matching the golden.
const QUICK_REPLIES: { label: string; tone?: string; text: (payUrl: string | null) => string | null }[] = [
  { label: "Plating in 5 min 🍕", tone: "b", text: () => "Your order is plating now — about 5 minutes to go! 🍕" },
  { label: "Share live order link", text: (u) => u },
  { label: "Offer free tiramisù", text: () => "On us today: a complimentary tiramisù with your order. 🍰" },
  { label: "Ask for feedback ⭐", text: () => "We'd love your feedback — how was everything today? ⭐" },
];

function mergeConversations(sessions: WaSessionRow[], heads: TranscriptHead[]): ConversationRow[] {
  const byPhone = new Map<string, ConversationRow>();
  for (const h of heads) {
    byPhone.set(h.phone, {
      phone: h.phone,
      lastAt: h.lastAt,
      customerName: null,
      cartCount: 0,
      cartSubtotalGrosze: 0,
      fulfillmentType: null,
      pendingOrderId: null,
      pendingPaymentUrl: null,
      items: undefined,
      messageCount: h.messageCount,
      lastBody: h.lastBody,
      hasInbound: h.hasInbound,
      hasActiveSession: false,
    });
  }
  for (const s of sessions) {
    const ex = byPhone.get(s.phone);
    const row: ConversationRow = ex
      ? { ...ex, customerName: s.customerName ?? ex.customerName, hasActiveSession: true, cartCount: s.cartCount, cartSubtotalGrosze: s.cartSubtotalGrosze, fulfillmentType: s.fulfillmentType, pendingOrderId: s.pendingOrderId, pendingPaymentUrl: s.pendingPaymentUrl, items: s.items }
      : {
          phone: s.phone,
          lastAt: s.lastTurnAt,
          customerName: s.customerName,
          cartCount: s.cartCount,
          cartSubtotalGrosze: s.cartSubtotalGrosze,
          fulfillmentType: s.fulfillmentType,
          pendingOrderId: s.pendingOrderId,
          pendingPaymentUrl: s.pendingPaymentUrl,
          items: s.items,
          messageCount: 0,
          lastBody: "",
          hasInbound: false,
          hasActiveSession: true,
        };
    byPhone.set(s.phone, row);
  }
  return [...byPhone.values()].sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
}

/**
 * One conversation-list row. Memoised so the list doesn't re-render every row
 * when an unrelated bit of inbox state changes (a keystroke in the composer, a
 * selection on another row) — only rows whose own data or `selected` flag
 * actually changed re-render. `onSelect` must be a stable callback for the memo
 * to hold.
 */
const ConvRow = memo(function ConvRow({
  c,
  selected,
  onSelect,
}: {
  c: ConversationRow;
  selected: boolean;
  onSelect: (phone: string) => void;
}) {
  // No per-conversation read state exists yet (see DATA NEEDED); "unread" is
  // proxied by "the guest has sent at least one inbound message".
  const unread = c.hasInbound;
  return (
    <button
      className={`core-conv${selected ? " on" : ""}${unread ? " unread" : ""}`}
      onClick={() => onSelect(c.phone)}
    >
      <span className={`core-av v-${avatarVariant(c.phone)}`}>{initials(c.customerName, c.phone)}</span>
      <span className="cbody">
        <span className="crow">
          <span className="nm">{c.customerName || c.phone}</span>
          <span className="tm">{clock(c.lastAt)}</span>
        </span>
        <span className="pv">{c.lastBody || "—"}</span>
        {(c.hasActiveSession || c.pendingPaymentUrl) && (
          <span className="cbadges">
            {c.hasActiveSession && (
              <span className="core-cbadge live">● live{c.pendingOrderId ? ` #${shortRef(c.pendingOrderId)}` : ""}</span>
            )}
            {c.pendingPaymentUrl && <span className="core-cbadge pay">pay pending</span>}
          </span>
        )}
      </span>
    </button>
  );
});

/** One message bubble (+ its day separator). Memoised on the message object —
 *  the thread reuses message identities when appending, so an arriving message
 *  mounts one new bubble instead of re-rendering the whole thread. */
const MessageBubble = memo(function MessageBubble({
  m,
  sep,
  sepLabel,
}: {
  m: WaMessage;
  sep: boolean;
  sepLabel: string;
}) {
  const { group, label } = actorLabel(m);
  const card = messageCard(m);
  const outbound = m.direction === "out";
  return (
    <>
      {sep && <div className="core-day-sep"><span>{sepLabel}</span></div>}
      <div className={`core-msg ${group}`}>
        <div className="core-bub">
          {m.kind && m.kind !== "text" && KIND_BADGE[m.kind] && (
            <span className="core-bub-kind">{KIND_BADGE[m.kind]}</span>
          )}
          {m.body}
          {card && (
            <div className="core-card">
              {card.map((r, i) => (
                <div className="r" key={i}>
                  <span>{r.label}</span>
                  <span className={r.tone ? "st" : ""}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="core-msg-meta">
          {group !== "staff" && <span className="actor">{label}</span>}
          <span>{clock(m.at)}</span>
          {outbound && <span>✓✓</span>}
          {group === "staff" && <span className="actor">{label}</span>}
        </div>
      </div>
    </>
  );
});

/**
 * The reply composer (quick-replies + textarea + send). Owns its own draft
 * state so typing re-renders only this subtree, never the conversation list or
 * the message thread. `onSend` runs the actual send and resolves false on
 * failure, at which point the draft is restored so nothing is silently lost.
 */
const Composer = memo(function Composer({
  windowOpen,
  sending,
  pendingPaymentUrl,
  onSend,
  onNeedPayLink,
  onAttach,
}: {
  windowOpen: boolean;
  sending: boolean;
  pendingPaymentUrl: string | null;
  onSend: (body: string) => Promise<boolean>;
  onNeedPayLink: () => void;
  onAttach: () => void;
}) {
  const [reply, setReply] = useState("");
  const insert = (text: string | null) => {
    if (!text) return onNeedPayLink();
    setReply((r) => (r.trim() ? `${r.trim()} ${text}` : text));
  };
  const submit = async () => {
    const body = reply.trim();
    if (!body || sending) return;
    setReply("");
    const ok = await onSend(body);
    // Restore the draft only if the operator hasn't started typing a new one.
    if (!ok) setReply((cur) => (cur.trim() ? cur : body));
  };
  return (
    <div className="core-composer-wrap">
      <div className="core-quickreplies">
        {QUICK_REPLIES.map((q) => (
          <button key={q.label} type="button" className={q.tone === "b" ? "b" : undefined} onClick={() => insert(q.text(pendingPaymentUrl))}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="core-composebar">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={windowOpen ? "Type a reply… (Enter to send)" : "24h window closed — a template is needed to reopen"}
          rows={1}
        />
        <button type="button" className="core-clip" title="Attach" aria-label="Attach a file" onClick={onAttach}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17a1.5 1.5 0 0 1-2-2l7.5-7.5" />
          </svg>
        </button>
        <button className="core-send-msg" title="Send" aria-label="Send message" disabled={!reply.trim() || sending} onClick={() => void submit()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l18-7-7 18-2.5-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
});

interface WaSettings {
  enabled: boolean;
  welcomeMessage: string;
  optOutPhrases: string[];
  defaultLocation: string | null;
  dailyMessageCap: number;
  reopenTemplate: string;
  autoArchiveMinutes: number;
  aiEnabled: boolean;
  aiInstructions: string;
  awayMessage: string;
  autoReplies: { keyword: string; reply: string }[];
  businessHours: { enabled: boolean; days: { open: string; close: string; closed: boolean }[] };
  abandonedCart: { enabled: boolean; delayHours: number };
  flows: WaFlow[];
}
interface WaFlow { id: string; name: string; trigger: string; enabled: boolean; steps: { prompt: string }[] }
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The WhatsApp bot configuration panel — welcome / opt-out / cap / AI / away /
 * keyword auto-replies / business hours / abandoned-cart. Loads the live
 * settings (GET) and writes the whole edited object back (PATCH). `flows` +
 * `defaultLocation` are preserved untouched.
 */
function WaSettingsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useCoreToast();
  const [s, setS] = useState<WaSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setS(null);
    fetch("/api/admin/whatsapp/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setS(d))
      .catch(() => setS(null));
  }, [open]);

  const patch = (p: Partial<WaSettings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const setDay = (i: number, p: Partial<{ open: string; close: string; closed: boolean }>) =>
    setS((cur) => (cur ? { ...cur, businessHours: { ...cur.businessHours, days: cur.businessHours.days.map((d, j) => (j === i ? { ...d, ...p } : d)) } } : cur));
  const mapFlows = (fn: (flows: WaFlow[]) => WaFlow[]) => setS((cur) => (cur ? { ...cur, flows: fn(cur.flows) } : cur));
  const setFlow = (i: number, p: Partial<WaFlow>) => mapFlows((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));

  const save = async () => {
    if (!s || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (res.ok) {
        toast("WhatsApp settings saved", "success");
        onSaved();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "Could not save settings", "danger");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CoreDialog
      open={open}
      onClose={onClose}
      title="WhatsApp settings"
      width={600}
      footer={
        <>
          <button className="core-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="core-btn primary" onClick={() => void save()} disabled={saving || !s}>Save</button>
        </>
      }
    >
      {!s ? (
        <div className="core-kds-empty pad">Loading settings…</div>
      ) : (
        <div className="core-wa-settings">
          <label className="core-wa-row">
            <span>Bot enabled</span>
            <button type="button" className={`core-toggle ${s.enabled ? "on" : ""}`} onClick={() => patch({ enabled: !s.enabled })} aria-pressed={s.enabled}><span className="knob" /></button>
          </label>

          <label className="core-tbl-field"><span>Welcome message</span>
            <textarea className="core-textarea" rows={2} value={s.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value })} />
          </label>

          <label className="core-wa-row">
            <span>AI concierge</span>
            <button type="button" className={`core-toggle ${s.aiEnabled ? "on" : ""}`} onClick={() => patch({ aiEnabled: !s.aiEnabled })} aria-pressed={s.aiEnabled}><span className="knob" /></button>
          </label>
          <label className="core-tbl-field"><span>AI instructions (persona / promos)</span>
            <textarea className="core-textarea" rows={2} value={s.aiInstructions} onChange={(e) => patch({ aiInstructions: e.target.value })} placeholder="e.g. Always suggest a dessert. Mention the lunch combo before 14:00." />
          </label>
          <label className="core-tbl-field"><span>Away message (when AI is off / out of hours)</span>
            <textarea className="core-textarea" rows={2} value={s.awayMessage} onChange={(e) => patch({ awayMessage: e.target.value })} />
          </label>

          <div className="core-wa-grid">
            <label className="core-tbl-field"><span>Daily message cap</span>
              <input className="core-inp" type="number" value={s.dailyMessageCap} onChange={(e) => patch({ dailyMessageCap: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label className="core-tbl-field"><span>Auto-archive after (min, 0 = off)</span>
              <input className="core-inp" type="number" value={s.autoArchiveMinutes} onChange={(e) => patch({ autoArchiveMinutes: parseInt(e.target.value, 10) || 0 })} />
            </label>
          </div>
          <label className="core-tbl-field"><span>Re-open template name</span>
            <input className="core-inp" value={s.reopenTemplate} onChange={(e) => patch({ reopenTemplate: e.target.value })} placeholder="welcome_back" />
          </label>
          <label className="core-tbl-field"><span>Opt-out phrases (comma-separated)</span>
            <input className="core-inp" value={s.optOutPhrases.join(", ")} onChange={(e) => patch({ optOutPhrases: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </label>

          {/* keyword auto-replies */}
          <div className="core-wa-sec-h">Keyword auto-replies</div>
          <div className="core-wa-ar">
            {s.autoReplies.map((ar, i) => (
              <div key={i} className="core-wa-ar-row">
                <input className="core-inp" value={ar.keyword} placeholder="keyword" onChange={(e) => patch({ autoReplies: s.autoReplies.map((x, j) => (j === i ? { ...x, keyword: e.target.value } : x)) })} />
                <input className="core-inp" value={ar.reply} placeholder="canned reply" onChange={(e) => patch({ autoReplies: s.autoReplies.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)) })} />
                <button type="button" className="core-slot-x" aria-label="Remove" onClick={() => patch({ autoReplies: s.autoReplies.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="core-btn ghost sm" onClick={() => patch({ autoReplies: [...s.autoReplies, { keyword: "", reply: "" }] })}>+ Add auto-reply</button>
          </div>

          {/* business hours */}
          <div className="core-wa-sec-h">
            Business hours
            <button type="button" className={`core-toggle ${s.businessHours.enabled ? "on" : ""}`} onClick={() => patch({ businessHours: { ...s.businessHours, enabled: !s.businessHours.enabled } })} aria-pressed={s.businessHours.enabled}><span className="knob" /></button>
          </div>
          {s.businessHours.enabled && (
            <div className="core-wa-days">
              {s.businessHours.days.map((d, i) => (
                <div key={i} className="core-wa-day">
                  <span className="dn">{WEEKDAYS[i]}</span>
                  {d.closed ? (
                    <span className="core-cust-sub" style={{ flex: 1 }}>Closed</span>
                  ) : (
                    <>
                      <input className="core-inp" type="time" value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} />
                      <input className="core-inp" type="time" value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} />
                    </>
                  )}
                  <button type="button" className={d.closed ? "core-chip on" : "core-chip"} onClick={() => setDay(i, { closed: !d.closed })}>{d.closed ? "Closed" : "Open"}</button>
                </div>
              ))}
            </div>
          )}

          {/* abandoned cart */}
          <div className="core-wa-sec-h">
            Abandoned-cart recovery
            <button type="button" className={`core-toggle ${s.abandonedCart.enabled ? "on" : ""}`} onClick={() => patch({ abandonedCart: { ...s.abandonedCart, enabled: !s.abandonedCart.enabled } })} aria-pressed={s.abandonedCart.enabled}><span className="knob" /></button>
          </div>
          {s.abandonedCart.enabled && (
            <label className="core-tbl-field"><span>Send the re-open template after (hours)</span>
              <input className="core-inp" type="number" value={s.abandonedCart.delayHours} onChange={(e) => patch({ abandonedCart: { ...s.abandonedCart, delayHours: parseInt(e.target.value, 10) || 0 } })} />
            </label>
          )}

          {/* scripted flows — deterministic, run ahead of the LLM */}
          <div className="core-wa-sec-h">Scripted flows</div>
          <div className="core-wa-flows">
            {s.flows.map((f, i) => (
              <div key={f.id} className="core-wa-flow">
                <div className="core-wa-flow-h">
                  <input className="core-inp" value={f.name} onChange={(e) => setFlow(i, { name: e.target.value })} placeholder="Flow name" />
                  <button type="button" className={`core-toggle ${f.enabled ? "on" : ""}`} onClick={() => setFlow(i, { enabled: !f.enabled })} aria-pressed={f.enabled}><span className="knob" /></button>
                  <button type="button" className="core-slot-x" aria-label="Remove flow" onClick={() => mapFlows((fs) => fs.filter((_, j) => j !== i))}>✕</button>
                </div>
                <input className="core-inp" value={f.trigger} onChange={(e) => setFlow(i, { trigger: e.target.value })} placeholder="Trigger phrase (e.g. catering)" />
                <div className="core-wa-steps">
                  {f.steps.map((st, si) => (
                    <div key={si} className="core-wa-step">
                      <span className="sn">{si + 1}</span>
                      <input className="core-inp" value={st.prompt} onChange={(e) => setFlow(i, { steps: f.steps.map((x, k) => (k === si ? { prompt: e.target.value } : x)) })} placeholder="Bot prompt for this step" />
                      <button type="button" className="core-slot-x" aria-label="Remove step" onClick={() => setFlow(i, { steps: f.steps.filter((_, k) => k !== si) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="core-btn ghost sm" onClick={() => setFlow(i, { steps: [...f.steps, { prompt: "" }] })}>+ Step</button>
                </div>
              </div>
            ))}
            <button type="button" className="core-btn ghost sm" onClick={() => mapFlows((fs) => [...fs, { id: `flow-${Date.now()}`, name: "New flow", trigger: "", enabled: true, steps: [{ prompt: "" }] }])}>+ Add flow</button>
          </div>
        </div>
      )}
    </CoreDialog>
  );
}

interface WaAudience { key: string; label: string; hint: string; count: number }
interface WaCampaign {
  id: string;
  template: string;
  audienceLabel: string;
  phones: string[];
  cursor: number;
  sentCount: number;
  failedCount: number;
  status: string;
}

/**
 * WhatsApp broadcast campaigns — pick an audience snapshot + a Meta template,
 * queue it, then drive it to completion in batches (`/{id}/send` looped until
 * the campaign reports a terminal status).
 */
function WaBroadcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useCoreToast();
  const [audiences, setAudiences] = useState<WaAudience[]>([]);
  const [campaigns, setCampaigns] = useState<WaCampaign[]>([]);
  const [audienceKey, setAudienceKey] = useState("all");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/whatsapp/broadcasts");
    if (!r.ok) return;
    const d = await r.json();
    setAudiences(d.audiences ?? []);
    setCampaigns(d.campaigns ?? []);
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const create = async () => {
    if (!template.trim() || busy) {
      if (!template.trim()) toast("A Meta template name is required", "danger");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/whatsapp/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: template.trim(), audienceKey }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.campaign) {
        setCampaigns((c) => [d.campaign, ...c]);
        setTemplate("");
        toast("Campaign queued", "success");
      } else toast(d.error || "Could not create campaign", "danger");
    } finally {
      setBusy(false);
    }
  };

  const driveSend = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 200; i++) {
        const r = await fetch(`/api/admin/whatsapp/broadcasts/${encodeURIComponent(id)}/send`, { method: "POST" });
        if (!r.ok) {
          toast("Send failed", "danger");
          break;
        }
        const d = await r.json();
        const c = d.campaign as WaCampaign;
        setCampaigns((cur) => cur.map((x) => (x.id === id ? c : x)));
        if (["done", "completed", "cancelled", "failed"].includes(c.status)) {
          toast(`Campaign ${c.status} · ${c.sentCount} sent`, "success");
          break;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const selAud = audiences.find((a) => a.key === audienceKey);

  return (
    <CoreDialog open={open} onClose={onClose} title="Broadcast campaign" width={580}>
      <div className="core-wa-settings">
        <div className="core-tbl-field"><span>Audience</span>
          <div className="core-segs" style={{ marginTop: 2 }}>
            {audiences.map((a) => (
              <button key={a.key} type="button" className={audienceKey === a.key ? "on" : ""} onClick={() => setAudienceKey(a.key)} title={a.hint}>
                {a.label} · {a.count}
              </button>
            ))}
          </div>
          {selAud && <p className="core-cust-sub" style={{ marginTop: 6 }}>{selAud.hint} — {selAud.count} reachable.</p>}
        </div>
        <label className="core-tbl-field"><span>Meta template name</span>
          <input className="core-inp" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="weekend_special" />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="core-btn primary" disabled={busy || !template.trim()} onClick={() => void create()}>Queue campaign</button>
        </div>

        <div className="core-wa-sec-h">Campaigns</div>
        {campaigns.length === 0 ? (
          <div className="core-cust-sub">No campaigns yet.</div>
        ) : (
          <div className="core-bc-list">
            {campaigns.map((c) => {
              const total = c.phones?.length ?? 0;
              const pct = total ? Math.round((c.cursor / total) * 100) : 0;
              const terminal = ["done", "completed", "cancelled", "failed"].includes(c.status);
              return (
                <div key={c.id} className="core-bc">
                  <div className="core-bc-h">
                    <b>{c.template}</b>
                    <span className={`core-bc-status ${terminal ? "done" : "live"}`}>{c.status}</span>
                  </div>
                  <div className="core-cust-sub">{c.audienceLabel} · {total} recipients · {c.sentCount} sent{c.failedCount ? ` · ${c.failedCount} failed` : ""}</div>
                  <div className="core-track" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
                  {!terminal && (
                    <button type="button" className="core-btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => void driveSend(c.id)}>
                      {busy ? "Sending…" : "Drive send →"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CoreDialog>
  );
}

/**
 * Core · Guest · Inbox — the WhatsApp till. A 3-pane console (conversation
 * list · thread · live context), wired 1:1 to the shared engine:
 * sessions + transcripts + flags + metrics, send via
 * POST /sessions/{phone}/message, archive/pin via POST /flags. Own core- UI.
 */
export function CoreInbox() {
  const toast = useCoreToast();
  const [sessions, setSessions] = useState<WaSessionRow[]>([]);
  const [heads, setHeads] = useState<TranscriptHead[]>([]);
  const [flags, setFlags] = useState<{ archived: string[]; pinned: string[] }>({ archived: [], pinned: [] });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [rollup, setRollup] = useState<GuestRollup | null>(null);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [nbaSkipped, setNbaSkipped] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [funnelWindow, setFunnelWindow] = useState<FunnelWindow>("7d");
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!funnelOpen) return;
    setFunnel(null);
    fetch(`/api/admin/whatsapp/funnel?window=${funnelWindow}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFunnel(d))
      .catch(() => setFunnel(null));
  }, [funnelOpen, funnelWindow]);

  const loadAll = useCallback(async () => {
    try {
      const [s, t, f] = await Promise.all([
        fetch("/api/admin/whatsapp/sessions").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/admin/whatsapp/transcripts?limit=100").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/admin/whatsapp/flags").then((r) => (r.ok ? r.json() : { archived: [], pinned: [] })),
      ]);
      setSessions(Array.isArray(s) ? s : s.sessions ?? []);
      setHeads(Array.isArray(t) ? t : t.transcripts ?? []);
      setFlags({ archived: f.archived ?? [], pinned: f.pinned ?? [] });
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadAll();
    fetch("/api/admin/whatsapp/metrics").then((r) => (r.ok ? r.json() : null)).then(setMetrics).catch(() => {});
  }, [loadAll]);
  // Visibility-aware refresh — a backgrounded inbox stops polling the API.
  usePolling(loadAll, 10000);

  const loadThread = useCallback(async (phone: string) => {
    try {
      const r = await fetch(`/api/admin/whatsapp/transcripts/${encodeURIComponent(phone)}?limit=100`);
      if (!r.ok) return;
      const d = await r.json();
      setThread(Array.isArray(d.messages) ? d.messages : []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!selected) {
      setThread([]);
      setRollup(null);
      return;
    }
    setNbaSkipped(false);
    void loadThread(selected);
    // Maps the real /customers/{phone} shape: { member, totals } (the loyalty
    // member row carries name + signup date; totals carry spend + order count).
    fetch(`/api/admin/customers/${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const m = d.member as { name?: string; lastName?: string; signedUpAt?: string; tier?: string } | null;
        const totals = (d.totals ?? {}) as { totalSpent?: number; orderCount?: number };
        setRollup({
          name: m ? [m.name, m.lastName].filter(Boolean).join(" ") || null : (d.customerName ?? null),
          tier: m?.tier ?? d.tier ?? null,
          ltv: totals.totalSpent ?? 0,
          visits: totals.orderCount ?? 0,
          isMember: !!m,
          memberSince: m?.signedUpAt ?? null,
        });
      })
      .catch(() => {});
  }, [selected, loadThread]);
  // Visibility-aware thread refresh; skipped while a reply is on the wire so it
  // can't replace the thread with a server copy that predates the just-sent
  // message (the optimistic bubble would flicker out and back).
  usePolling(
    () => {
      if (selected && !sending) void loadThread(selected);
    },
    6000,
    { enabled: !!selected },
  );

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight });
  }, [thread]);

  const conversations = useMemo(() => mergeConversations(sessions, heads), [sessions, heads]);
  const archivedSet = useMemo(() => new Set(flags.archived), [flags.archived]);
  const pinnedSet = useMemo(() => new Set(flags.pinned), [flags.pinned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "archived" ? !archivedSet.has(c.phone) : archivedSet.has(c.phone)) return false;
      if (filter === "unread" && !c.hasInbound) return false;
      if (filter === "live" && !c.hasActiveSession) return false;
      if (q && !(c.phone.includes(q) || (c.customerName ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [conversations, filter, query, archivedSet]);

  // Land on a populated thread like the mockup: auto-select the top visible
  // conversation on load, and re-home to the first row if the current pick is
  // filtered out (a manual pick within the list still wins). Mirrors CRM.
  useEffect(() => {
    if (filtered.length === 0) return;
    if (!selected || !filtered.some((c) => c.phone === selected)) {
      setSelected(filtered[0].phone);
    }
  }, [filtered, selected]);

  // Filter-chip counts (over non-archived conversations), plus the archived tally.
  const chipCounts = useMemo(() => {
    const open = conversations.filter((c) => !archivedSet.has(c.phone));
    return {
      all: open.length,
      unread: open.filter((c) => c.hasInbound).length,
      live: open.filter((c) => c.hasActiveSession).length,
      archived: archivedSet.size,
    };
  }, [conversations, archivedSet]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.phone === selected) ?? null,
    [conversations, selected],
  );
  const onSelect = useCallback((phone: string) => setSelected(phone), []);

  // Next-Best-Action for the selected guest. There is no recommendation source
  // yet (see DATA NEEDED); rather than fabricate a tip we surface none, and the
  // card renders 1:1 the moment a real NBA is supplied here.
  const nba = useMemo<Nba | null>(() => null, []);

  // Day-separated thread rows, derived once per thread change (not re-walked on
  // every render). Message identities are reused across appends, so a memoised
  // <MessageBubble> only re-renders the bubble whose message changed.
  const threadRows = useMemo(() => {
    let lastDay = "";
    return thread.map((m, i) => {
      const dk = new Date(m.at).toDateString();
      const sep = dk !== lastDay;
      lastDay = dk;
      return { m, i, sep, sepLabel: sep ? dayLabel(m.at) : "" };
    });
  }, [thread]);

  // WhatsApp's 24h customer-service window: free-text replies only land while
  // the last inbound message is < 24h old; otherwise a template must reopen it.
  const windowOpen = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === "in") return Date.now() - new Date(thread[i].at).getTime() < 24 * 3600 * 1000;
    }
    return false;
  }, [thread]);

  const onNeedPayLink = useCallback(() => toast("No payment link on this conversation yet", "danger"), [toast]);
  const onAttach = useCallback(() => toast("Attachments aren't supported on this channel yet", "danger"), [toast]);

  // Send a reply. Returns false on failure so the Composer can restore its draft.
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!selected || !body || sending) return false;
      // Optimistic bubble — the operator sees their reply land instantly instead
      // of waiting a round-trip for loadThread. The poll is held while `sending`
      // so a stale frame can't drop it; loadThread reconciles to server truth.
      const optimistic: WaMessage = { at: new Date().toISOString(), direction: "out", body, actor: "operator", kind: "text" };
      setSending(true);
      setThread((t) => [...t, optimistic]);
      try {
        const res = await fetch(`/api/admin/whatsapp/sessions/${encodeURIComponent(selected)}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          await loadThread(selected);
          toast("Message sent", "success");
          return true;
        }
        const d = await res.json().catch(() => ({}));
        // Roll the optimistic bubble back; the Composer restores the draft.
        setThread((t) => t.filter((m) => m !== optimistic));
        toast(d.error || "Outside the 24h window — send a template to reopen", "danger");
        return false;
      } finally {
        setSending(false);
      }
    },
    [selected, sending, loadThread, toast],
  );

  const setFlag = useCallback(
    async (phone: string, patch: { archived?: boolean; pinned?: boolean }) => {
      try {
        const res = await fetch("/api/admin/whatsapp/flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, ...patch }),
        });
        if (res.ok) await loadAll();
      } catch {
        /* non-fatal */
      }
    },
    [loadAll],
  );

  // Dense-console stat strip — mockup cell order. Figures 1–3 are live WhatsApp
  // metrics (Rule #1). Response time + opt-ins have no source in the metrics
  // endpoint yet (see DATA NEEDED): they render a muted em dash until supplied,
  // never a fabricated number.
  const kpis: { l: string; v: string; tone: string; d: string; small?: string; dTone?: string }[] = metrics
    ? [
        { l: "Open convos", v: String(metrics.activeSessions.totalSessions), tone: "", d: `${metrics.historicConversations} all-time` },
        { l: "Awaiting reply", v: String(metrics.activeSessions.awaitingPayment), tone: metrics.activeSessions.awaitingPayment > 0 ? "amber" : "", d: metrics.activeSessions.awaitingPayment > 0 ? "needs a reply" : "all answered", dTone: metrics.activeSessions.awaitingPayment > 0 ? "warn" : "" },
        { l: "Live orders", v: String(metrics.activeSessions.cartHasItems ?? 0), tone: "info", d: "with items" },
        metrics.responseTimeMinutes != null
          ? { l: "Response time", v: String(metrics.responseTimeMinutes), small: "m", tone: "basil", d: "" }
          : { l: "Response time", v: "—", tone: "muted", d: "needs metric" },
        metrics.optInRate != null
          ? { l: "Opt-ins", v: String(Math.round(metrics.optInRate * 100)), small: "%", tone: "", d: "" }
          : { l: "Opt-ins", v: "—", tone: "muted", d: "needs metric" },
      ]
    : [];

  return (
    <CoreShell
      eyebrow="Guest Engagement"
      tabs={guestTabs("inbox")}
    >
      <div className="core-guest-inbox">
        <CoreCrumb section="GUEST" page="INBOX" mode="whatsapp live" />
        <CoreSectionHead section="Guest" page="Inbox" sub={<>whatsapp · 3-pane over unified stat strip</>} />
        {/* Row 4 — no filters; actions right (funnel · broadcast · settings · live). */}
        <CoreSurfToolbar
          ariaLabel="Inbox controls"
          right={
            <>
              <button type="button" className="core-iconbtn" title="Conversion funnel" aria-label="Conversion funnel" onClick={() => setFunnelOpen(true)}>
                <GuestGlyph name="funnel" />
              </button>
              <button type="button" className="core-iconbtn" title="Broadcast campaign" aria-label="Broadcast campaign" onClick={() => setBroadcastOpen(true)}>
                <GuestGlyph name="broadcast" />
              </button>
              <button type="button" className="core-iconbtn" title="WhatsApp settings" aria-label="WhatsApp settings" onClick={() => setSettingsOpen(true)}>
                <GuestGlyph name="settings" />
              </button>
              <span className="core-chip" style={{ height: 32 }}><span className="dot" />WhatsApp live</span>
            </>
          }
        />
        {kpis.length > 0 && (
          <div className="core-statstrip" role="group" aria-label="Inbox metrics">
            {kpis.map((k) => (
              <div className="cell" key={k.l}>
                <span className="lab">{k.l}</span>
                <span className={k.tone ? `val ${k.tone}` : "val"}>{k.v}{k.small && <small>{k.small}</small>}</span>
                <span className={k.dTone ? `delta ${k.dTone}` : "delta"}>{k.d}</span>
              </div>
            ))}
          </div>
        )}
        <div className="core-inbox">
          {/* conversation list */}
          <section className="core-convs">
            <div className="core-pane-h">
              <span className="t">Conversations</span>
              <span className="badge">{chipCounts.all} open</span>
            </div>
            <div className="core-fchips" role="group" aria-label="Filter conversations">
              <button type="button" className={`core-fchip${filter === "all" ? " on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                all <span className="ct">{chipCounts.all}</span>
              </button>
              <button type="button" className={`core-fchip${filter === "unread" ? " on" : ""}`} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>
                unread <span className="ct">{chipCounts.unread}</span>
              </button>
              <button type="button" className={`core-fchip${filter === "live" ? " on" : ""}`} aria-pressed={filter === "live"} onClick={() => setFilter("live")}>
                live <span className="ct">{chipCounts.live}</span>
              </button>
              {chipCounts.archived > 0 && (
                <button type="button" className={`core-fchip${filter === "archived" ? " on" : ""}`} aria-pressed={filter === "archived"} onClick={() => setFilter("archived")}>
                  archived <span className="ct">{chipCounts.archived}</span>
                </button>
              )}
            </div>
            <div className="core-convs-search">
              <div className="core-search">
                <GuestGlyph name="search" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" aria-label="Search conversations" />
              </div>
            </div>
            <div className="core-conv-list">
              {filtered.length === 0 ? (
                <div className="core-kds-empty pad">No conversations.</div>
              ) : (
                filtered.map((c) => (
                  <ConvRow key={c.phone} c={c} selected={c.phone === selected} onSelect={onSelect} />
                ))
              )}
            </div>
          </section>

          {/* thread */}
          <section className="core-thread">
            {!selectedConv ? (
              <div className="core-thread-empty">Select a conversation to read and reply.</div>
            ) : (
              <>
                <div className="core-thread-h">
                  <span className="core-av">{initials(selectedConv.customerName, selectedConv.phone)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{selectedConv.customerName || selectedConv.phone}</div>
                    <div className="meta">
                      {maskPhone(selectedConv.phone)}
                      {rollup?.isMember ? ` · ${rollup.tier ?? "Member"}` : ""} · WhatsApp
                    </div>
                  </div>
                  <span className={`core-window ${windowOpen ? "open" : "closed"}`}>24h · {windowOpen ? "open" : "closed"}</span>
                  <button className={`core-iconbtn${pinnedSet.has(selectedConv.phone) ? " on" : ""}`} title={pinnedSet.has(selectedConv.phone) ? "Unpin" : "Pin"} aria-label={pinnedSet.has(selectedConv.phone) ? "Unpin" : "Pin"} onClick={() => void setFlag(selectedConv.phone, { pinned: !pinnedSet.has(selectedConv.phone) })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 4v6l-2 4h10l-2-4V4M12 18v3M8 4h8" />
                    </svg>
                  </button>
                  <button className="core-iconbtn" title={archivedSet.has(selectedConv.phone) ? "Unarchive" : "Archive"} aria-label={archivedSet.has(selectedConv.phone) ? "Unarchive" : "Archive"} onClick={() => void setFlag(selectedConv.phone, { archived: !archivedSet.has(selectedConv.phone) })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
                    </svg>
                  </button>
                </div>
                <div className="core-msgs" ref={msgsRef}>
                  {threadRows.length === 0 ? (
                    <div className="core-kds-empty pad">No messages yet.</div>
                  ) : (
                    threadRows.map((r) => (
                      <MessageBubble key={`${r.i}-${r.m.at}`} m={r.m} sep={r.sep} sepLabel={r.sepLabel} />
                    ))
                  )}
                </div>
                <Composer
                  windowOpen={windowOpen}
                  sending={sending}
                  pendingPaymentUrl={selectedConv.pendingPaymentUrl}
                  onSend={send}
                  onNeedPayLink={onNeedPayLink}
                  onAttach={onAttach}
                />
              </>
            )}
          </section>

          {/* context */}
          <aside className="core-ctx">
            {selectedConv ? (
              <>
                <div className="core-pane-h">
                  <span className="t">Guest context</span>
                  {selectedConv.pendingOrderId && <span className="badge">#{shortRef(selectedConv.pendingOrderId)}</span>}
                </div>
                <div className="core-ctx-body">
                  {/* guest card */}
                  {(() => {
                    const gName = rollup?.name || selectedConv.customerName || "Walk-in";
                    const since = rollup?.memberSince ? new Date(rollup.memberSince) : null;
                    const sinceYear = since && !Number.isNaN(since.getTime()) ? since.getFullYear() : null;
                    return (
                      <div className="core-ctx-guest">
                        <span className={`core-av v-${avatarVariant(selectedConv.phone)}`}>{initials(gName === "Walk-in" ? null : gName, selectedConv.phone)}</span>
                        <div className="g">
                          <div className="n">
                            {gName}
                            {rollup?.isMember && <span className={`core-tierbadge2 ${tierClass(rollup.tier)}`}>★ {rollup.tier ?? "Member"}</span>}
                          </div>
                          <div className="p">{maskPhone(selectedConv.phone)}{sinceYear ? ` · member since ${sinceYear}` : ""}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* lifetime stats */}
                  <div className="core-lifestats">
                    <div className="core-lifestat"><div className="l">Visits</div><div className="v">{rollup?.visits ?? 0}</div></div>
                    <div className="core-lifestat"><div className="l">Lifetime spend</div><div className="v">{plInt(rollup?.ltv ?? 0)}<small> zł</small></div></div>
                  </div>

                  {/* live order — itemised when the session exposes lines, else summary */}
                  <div className="core-ctxlab">Live order</div>
                  {selectedConv.cartCount > 0 ? (
                    <div className="core-liveorder">
                      <div className="oh">
                        <span className="id">
                          {selectedConv.pendingOrderId ? `#${shortRef(selectedConv.pendingOrderId)}` : "Live cart"}
                          {selectedConv.fulfillmentType ? ` · ${selectedConv.fulfillmentType}` : ""}
                        </span>
                        <span className={`stt ${selectedConv.pendingPaymentUrl ? "pay" : "live"}`}>
                          <span className="d" />{selectedConv.pendingPaymentUrl ? "to pay" : "live"}
                        </span>
                      </div>
                      {selectedConv.items && selectedConv.items.length > 0 ? (
                        selectedConv.items.map((li, i) => (
                          <div className="oli" key={i}>
                            <span><span className="q">{li.qty}×</span>{li.name}</span>
                            <span className="lp">{plInt(li.priceGrosze)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="oli">
                          <span>{selectedConv.cartCount} item{selectedConv.cartCount === 1 ? "" : "s"}</span>
                          <span className="lp">{plInt(selectedConv.cartSubtotalGrosze)}</span>
                        </div>
                      )}
                      <div className="ot"><span>Total</span><span>{plInt(selectedConv.cartSubtotalGrosze)} zł</span></div>
                    </div>
                  ) : (
                    <div className="core-ctx-empty">No active cart.</div>
                  )}

                  {/* next best action */}
                  <div className="core-ctxlab">Next best action</div>
                  {nba && !nbaSkipped ? (
                    <div className="core-nba">
                      <div className="nh">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m12 2 3 6.3 6.9.9-5 4.8 1.3 6.9L12 17.6 5.8 20.9 7.1 14l-5-4.8 6.9-.9z" />
                        </svg>
                        NBA · {nba.kind}
                      </div>
                      <div className="nt">{nba.title}</div>
                      <div className="nw">{nba.rationale}</div>
                      <div className="nrow">
                        <button type="button" className="send" disabled={sending} onClick={() => void send(nba.message).then((ok) => ok && setNbaSkipped(true))}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 11l18-7-7 18-2.5-7z" />
                          </svg>
                          Send
                        </button>
                        <button type="button" className="skip" onClick={() => setNbaSkipped(true)}>Skip</button>
                      </div>
                    </div>
                  ) : (
                    <div className="core-ctx-empty">No suggested action.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="core-ctx-empty pad">Guest + order context appears here.</div>
            )}
          </aside>
        </div>
      </div>

      {/* conversion funnel */}
      <CoreDialog open={funnelOpen} onClose={() => setFunnelOpen(false)} title="WhatsApp conversion funnel" width={560}>
        <div className="core-funnel">
          <div className="core-seg" style={{ marginBottom: 14 }}>
            {(["7d", "30d", "all"] as FunnelWindow[]).map((w) => (
              <button key={w} type="button" className={funnelWindow === w ? "on" : ""} onClick={() => setFunnelWindow(w)}>{w === "all" ? "All" : w}</button>
            ))}
          </div>
          {!funnel ? (
            <div className="core-kds-empty pad">Loading funnel…</div>
          ) : (
            <>
              <div className="core-funnel-kpis">
                <div><span className="sv mono">{funnel.startedCount}</span><span className="sl">Started</span></div>
                <div><span className="sv mono">{funnel.paidCount}</span><span className="sl">Paid</span></div>
                <div><span className="sv mono">{Math.round(funnel.conversionRate * 100)}%</span><span className="sl">Conversion</span></div>
                <div><span className="sv mono">{funnel.uniqueConversations}</span><span className="sl">Unique</span></div>
              </div>
              <div className="core-funnel-stages">
                {funnel.stages.map((s) => (
                  <div key={s.stage} className="core-funnel-stage">
                    <div className="row">
                      <span className="lab">{s.label}</span>
                      <span className="cnt mono">{s.count}<span className="pct"> · {Math.round(s.pctOfStart * 100)}%</span></span>
                    </div>
                    <div className="core-track"><i style={{ width: `${Math.round(s.pctOfStart * 100)}%` }} /></div>
                    {s.dropFromPrev > 0 && <span className="drop">−{Math.round(s.dropFromPrev * 100)}% from previous step</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CoreDialog>

      <WaBroadcastDialog open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <WaSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void loadAll()} />
    </CoreShell>
  );
}
