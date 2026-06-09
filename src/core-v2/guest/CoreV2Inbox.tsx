"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { guestTabs } from "./guestTabs";
import { GuestGlyph, type GuestGlyphName } from "./glyphs";

interface WaSessionRow {
  phone: string;
  locationSlug: "krakow" | "warszawa" | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  customerName: string | null;
  fulfillmentType: "takeout" | "delivery" | null;
  pendingPaymentUrl: string | null;
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
  pendingPaymentUrl: string | null;
  messageCount: number;
  lastBody: string;
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
  tier: string;
  ltv: number;
  visits: number;
  isMember: boolean;
}
interface Metrics {
  windows: { last7d: { orders: { paid: number }; conversionRate: number } };
  activeSessions: { totalSessions: number; awaitingPayment: number };
  historicConversations: number;
}
type Filter = "inbox" | "live" | "awaiting" | "archived";
const CONV_FILTERS: { key: Filter; label: string; icon: GuestGlyphName }[] = [
  { key: "inbox", label: "Inbox", icon: "inbox" },
  { key: "live", label: "Live · window open", icon: "live" },
  { key: "awaiting", label: "Awaiting reply", icon: "awaiting" },
  { key: "archived", label: "Archived", icon: "archive" },
];

const zl = (g: number) => (g / 100).toFixed(2).replace(".", ",");
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

// Operator quick-reply starters; "Payment link" injects the live pay URL.
const QUICK_REPLIES: { label: string; text: (payUrl: string | null) => string | null }[] = [
  { label: "Menu", text: () => "Here's our menu — what are you craving today? 🍕 Just send the dishes and I'll start your order." },
  { label: "Payment link", text: (u) => u },
  { label: "Reservation", text: () => "Happy to book you a table — which day, time and how many guests?" },
  { label: "Comp dessert", text: () => "On us today: a complimentary tiramisù with your order. 🍰" },
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
      pendingPaymentUrl: null,
      messageCount: h.messageCount,
      lastBody: h.lastBody,
      hasActiveSession: false,
    });
  }
  for (const s of sessions) {
    const ex = byPhone.get(s.phone);
    const row: ConversationRow = ex
      ? { ...ex, customerName: s.customerName ?? ex.customerName, hasActiveSession: true, cartCount: s.cartCount, cartSubtotalGrosze: s.cartSubtotalGrosze, fulfillmentType: s.fulfillmentType, pendingPaymentUrl: s.pendingPaymentUrl }
      : {
          phone: s.phone,
          lastAt: s.lastTurnAt,
          customerName: s.customerName,
          cartCount: s.cartCount,
          cartSubtotalGrosze: s.cartSubtotalGrosze,
          fulfillmentType: s.fulfillmentType,
          pendingPaymentUrl: s.pendingPaymentUrl,
          messageCount: 0,
          lastBody: "",
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
  return (
    <button className={selected ? "cv-conv on" : "cv-conv"} onClick={() => onSelect(c.phone)}>
      <span className="cv-av">{initials(c.customerName, c.phone)}</span>
      <span className="cm">
        <span className="cn">
          {c.customerName || c.phone}
          <span className="ct">{clock(c.lastAt)}</span>
        </span>
        <span className="cp">
          {c.hasActiveSession && <span className="badge live">LIVE</span>}
          {c.pendingPaymentUrl && <span className="badge pay">PAY</span>}
          {c.lastBody || "—"}
        </span>
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
  return (
    <>
      {sep && <div className="cv-day-sep"><span>{sepLabel}</span></div>}
      <div className={`cv-bub ${m.actor}`}>
        {m.kind && m.kind !== "text" && KIND_BADGE[m.kind] && (
          <span className="cv-bub-kind">{KIND_BADGE[m.kind]}</span>
        )}
        {m.body}
        <span className="t">
          {m.actor === "operator" ? "You" : m.actor === "bot" ? "Bot" : m.actor === "system" ? "System" : ""} {clock(m.at)}
        </span>
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
}: {
  windowOpen: boolean;
  sending: boolean;
  pendingPaymentUrl: string | null;
  onSend: (body: string) => Promise<boolean>;
  onNeedPayLink: () => void;
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
    <>
      <div className="cv-quickreplies">
        {QUICK_REPLIES.map((q) => (
          <button key={q.label} type="button" onClick={() => insert(q.text(pendingPaymentUrl))}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="cv-composer">
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
        <button className="cv-send-msg" disabled={!reply.trim() || sending} onClick={() => void submit()}>
          ➤
        </button>
      </div>
    </>
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
    <CoreV2Dialog
      open={open}
      onClose={onClose}
      title="WhatsApp settings"
      width={600}
      footer={
        <>
          <button className="cv-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cv-btn primary" onClick={() => void save()} disabled={saving || !s}>Save</button>
        </>
      }
    >
      {!s ? (
        <div className="cv-kds-empty pad">Loading settings…</div>
      ) : (
        <div className="cv-wa-settings">
          <label className="cv-wa-row">
            <span>Bot enabled</span>
            <button type="button" className={`cv-toggle ${s.enabled ? "on" : ""}`} onClick={() => patch({ enabled: !s.enabled })} aria-pressed={s.enabled}><span className="knob" /></button>
          </label>

          <label className="cv-tbl-field"><span>Welcome message</span>
            <textarea className="cv-textarea" rows={2} value={s.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value })} />
          </label>

          <label className="cv-wa-row">
            <span>AI concierge</span>
            <button type="button" className={`cv-toggle ${s.aiEnabled ? "on" : ""}`} onClick={() => patch({ aiEnabled: !s.aiEnabled })} aria-pressed={s.aiEnabled}><span className="knob" /></button>
          </label>
          <label className="cv-tbl-field"><span>AI instructions (persona / promos)</span>
            <textarea className="cv-textarea" rows={2} value={s.aiInstructions} onChange={(e) => patch({ aiInstructions: e.target.value })} placeholder="e.g. Always suggest a dessert. Mention the lunch combo before 14:00." />
          </label>
          <label className="cv-tbl-field"><span>Away message (when AI is off / out of hours)</span>
            <textarea className="cv-textarea" rows={2} value={s.awayMessage} onChange={(e) => patch({ awayMessage: e.target.value })} />
          </label>

          <div className="cv-wa-grid">
            <label className="cv-tbl-field"><span>Daily message cap</span>
              <input className="cv-inp" type="number" value={s.dailyMessageCap} onChange={(e) => patch({ dailyMessageCap: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label className="cv-tbl-field"><span>Auto-archive after (min, 0 = off)</span>
              <input className="cv-inp" type="number" value={s.autoArchiveMinutes} onChange={(e) => patch({ autoArchiveMinutes: parseInt(e.target.value, 10) || 0 })} />
            </label>
          </div>
          <label className="cv-tbl-field"><span>Re-open template name</span>
            <input className="cv-inp" value={s.reopenTemplate} onChange={(e) => patch({ reopenTemplate: e.target.value })} placeholder="welcome_back" />
          </label>
          <label className="cv-tbl-field"><span>Opt-out phrases (comma-separated)</span>
            <input className="cv-inp" value={s.optOutPhrases.join(", ")} onChange={(e) => patch({ optOutPhrases: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </label>

          {/* keyword auto-replies */}
          <div className="cv-wa-sec-h">Keyword auto-replies</div>
          <div className="cv-wa-ar">
            {s.autoReplies.map((ar, i) => (
              <div key={i} className="cv-wa-ar-row">
                <input className="cv-inp" value={ar.keyword} placeholder="keyword" onChange={(e) => patch({ autoReplies: s.autoReplies.map((x, j) => (j === i ? { ...x, keyword: e.target.value } : x)) })} />
                <input className="cv-inp" value={ar.reply} placeholder="canned reply" onChange={(e) => patch({ autoReplies: s.autoReplies.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)) })} />
                <button type="button" className="cv-slot-x" aria-label="Remove" onClick={() => patch({ autoReplies: s.autoReplies.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="cv-btn ghost sm" onClick={() => patch({ autoReplies: [...s.autoReplies, { keyword: "", reply: "" }] })}>+ Add auto-reply</button>
          </div>

          {/* business hours */}
          <div className="cv-wa-sec-h">
            Business hours
            <button type="button" className={`cv-toggle ${s.businessHours.enabled ? "on" : ""}`} onClick={() => patch({ businessHours: { ...s.businessHours, enabled: !s.businessHours.enabled } })} aria-pressed={s.businessHours.enabled}><span className="knob" /></button>
          </div>
          {s.businessHours.enabled && (
            <div className="cv-wa-days">
              {s.businessHours.days.map((d, i) => (
                <div key={i} className="cv-wa-day">
                  <span className="dn">{WEEKDAYS[i]}</span>
                  {d.closed ? (
                    <span className="cv-cust-sub" style={{ flex: 1 }}>Closed</span>
                  ) : (
                    <>
                      <input className="cv-inp" type="time" value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} />
                      <input className="cv-inp" type="time" value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} />
                    </>
                  )}
                  <button type="button" className={d.closed ? "cv-chip on" : "cv-chip"} onClick={() => setDay(i, { closed: !d.closed })}>{d.closed ? "Closed" : "Open"}</button>
                </div>
              ))}
            </div>
          )}

          {/* abandoned cart */}
          <div className="cv-wa-sec-h">
            Abandoned-cart recovery
            <button type="button" className={`cv-toggle ${s.abandonedCart.enabled ? "on" : ""}`} onClick={() => patch({ abandonedCart: { ...s.abandonedCart, enabled: !s.abandonedCart.enabled } })} aria-pressed={s.abandonedCart.enabled}><span className="knob" /></button>
          </div>
          {s.abandonedCart.enabled && (
            <label className="cv-tbl-field"><span>Send the re-open template after (hours)</span>
              <input className="cv-inp" type="number" value={s.abandonedCart.delayHours} onChange={(e) => patch({ abandonedCart: { ...s.abandonedCart, delayHours: parseInt(e.target.value, 10) || 0 } })} />
            </label>
          )}

          {/* scripted flows — deterministic, run ahead of the LLM */}
          <div className="cv-wa-sec-h">Scripted flows</div>
          <div className="cv-wa-flows">
            {s.flows.map((f, i) => (
              <div key={f.id} className="cv-wa-flow">
                <div className="cv-wa-flow-h">
                  <input className="cv-inp" value={f.name} onChange={(e) => setFlow(i, { name: e.target.value })} placeholder="Flow name" />
                  <button type="button" className={`cv-toggle ${f.enabled ? "on" : ""}`} onClick={() => setFlow(i, { enabled: !f.enabled })} aria-pressed={f.enabled}><span className="knob" /></button>
                  <button type="button" className="cv-slot-x" aria-label="Remove flow" onClick={() => mapFlows((fs) => fs.filter((_, j) => j !== i))}>✕</button>
                </div>
                <input className="cv-inp" value={f.trigger} onChange={(e) => setFlow(i, { trigger: e.target.value })} placeholder="Trigger phrase (e.g. catering)" />
                <div className="cv-wa-steps">
                  {f.steps.map((st, si) => (
                    <div key={si} className="cv-wa-step">
                      <span className="sn">{si + 1}</span>
                      <input className="cv-inp" value={st.prompt} onChange={(e) => setFlow(i, { steps: f.steps.map((x, k) => (k === si ? { prompt: e.target.value } : x)) })} placeholder="Bot prompt for this step" />
                      <button type="button" className="cv-slot-x" aria-label="Remove step" onClick={() => setFlow(i, { steps: f.steps.filter((_, k) => k !== si) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="cv-btn ghost sm" onClick={() => setFlow(i, { steps: [...f.steps, { prompt: "" }] })}>+ Step</button>
                </div>
              </div>
            ))}
            <button type="button" className="cv-btn ghost sm" onClick={() => mapFlows((fs) => [...fs, { id: `flow-${Date.now()}`, name: "New flow", trigger: "", enabled: true, steps: [{ prompt: "" }] }])}>+ Add flow</button>
          </div>
        </div>
      )}
    </CoreV2Dialog>
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
    <CoreV2Dialog open={open} onClose={onClose} title="Broadcast campaign" width={580}>
      <div className="cv-wa-settings">
        <div className="cv-tbl-field"><span>Audience</span>
          <div className="cv-segs" style={{ marginTop: 2 }}>
            {audiences.map((a) => (
              <button key={a.key} type="button" className={audienceKey === a.key ? "on" : ""} onClick={() => setAudienceKey(a.key)} title={a.hint}>
                {a.label} · {a.count}
              </button>
            ))}
          </div>
          {selAud && <p className="cv-cust-sub" style={{ marginTop: 6 }}>{selAud.hint} — {selAud.count} reachable.</p>}
        </div>
        <label className="cv-tbl-field"><span>Meta template name</span>
          <input className="cv-inp" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="weekend_special" />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="cv-btn primary" disabled={busy || !template.trim()} onClick={() => void create()}>Queue campaign</button>
        </div>

        <div className="cv-wa-sec-h">Campaigns</div>
        {campaigns.length === 0 ? (
          <div className="cv-cust-sub">No campaigns yet.</div>
        ) : (
          <div className="cv-bc-list">
            {campaigns.map((c) => {
              const total = c.phones?.length ?? 0;
              const pct = total ? Math.round((c.cursor / total) * 100) : 0;
              const terminal = ["done", "completed", "cancelled", "failed"].includes(c.status);
              return (
                <div key={c.id} className="cv-bc">
                  <div className="cv-bc-h">
                    <b>{c.template}</b>
                    <span className={`cv-bc-status ${terminal ? "done" : "live"}`}>{c.status}</span>
                  </div>
                  <div className="cv-cust-sub">{c.audienceLabel} · {total} recipients · {c.sentCount} sent{c.failedCount ? ` · ${c.failedCount} failed` : ""}</div>
                  <div className="cv-track" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
                  {!terminal && (
                    <button type="button" className="cv-btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => void driveSend(c.id)}>
                      {busy ? "Sending…" : "Drive send →"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CoreV2Dialog>
  );
}

/**
 * Core v2 · Guest · Inbox — the WhatsApp till. A 3-pane console (conversation
 * list · thread · live context), wired 1:1 to the same engine as today's
 * /core/guest/whatsapp: sessions + transcripts + flags + metrics, send via
 * POST /sessions/{phone}/message, archive/pin via POST /flags. Own cv- UI.
 */
export function CoreV2Inbox() {
  const toast = useCoreToast();
  const [sessions, setSessions] = useState<WaSessionRow[]>([]);
  const [heads, setHeads] = useState<TranscriptHead[]>([]);
  const [flags, setFlags] = useState<{ archived: string[]; pinned: string[] }>({ archived: [], pinned: [] });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [rollup, setRollup] = useState<GuestRollup | null>(null);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [query, setQuery] = useState("");
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
    void loadThread(selected);
    fetch(`/api/admin/customers/${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRollup({ name: d.name ?? null, tier: d.tier ?? "—", ltv: d.ltv ?? d.totalSpent ?? 0, visits: d.visits ?? d.orderCount ?? 0, isMember: !!(d.isMember ?? d.member) }))
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
      if (filter === "live" && !c.hasActiveSession) return false;
      if (filter === "awaiting" && !c.pendingPaymentUrl) return false;
      if (q && !(c.phone.includes(q) || (c.customerName ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [conversations, filter, query, archivedSet]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.phone === selected) ?? null,
    [conversations, selected],
  );
  const onSelect = useCallback((phone: string) => setSelected(phone), []);

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

  const kpis = metrics
    ? [
        { l: "Paid · 7d", v: String(metrics.windows.last7d.orders.paid) },
        { l: "Conversion", v: `${Math.round(metrics.windows.last7d.conversionRate * 100)}%` },
        { l: "Live", v: String(metrics.activeSessions.totalSessions) },
        { l: "Awaiting", v: String(metrics.activeSessions.awaitingPayment) },
        { l: "Conversations", v: String(metrics.historicConversations) },
      ]
    : [];

  return (
    <CoreV2Shell
      eyebrow="Guest Engagement"
      tabs={guestTabs("inbox")}
      subRight={
        <>
          <button type="button" className="cv-iconbtn" title="Conversion funnel" aria-label="Conversion funnel" onClick={() => setFunnelOpen(true)}>
            <GuestGlyph name="funnel" />
          </button>
          <button type="button" className="cv-iconbtn" title="Broadcast campaign" aria-label="Broadcast campaign" onClick={() => setBroadcastOpen(true)}>
            <GuestGlyph name="broadcast" />
          </button>
          <button type="button" className="cv-iconbtn" title="WhatsApp settings" aria-label="WhatsApp settings" onClick={() => setSettingsOpen(true)}>
            <GuestGlyph name="settings" />
          </button>
          <span className="cv-chip" style={{ height: 32 }}><span className="dot" />WhatsApp live</span>
        </>
      }
    >
      <div className="cv-guest-inbox">
        {kpis.length > 0 && (
          <div className="cv-kpi-strip">
            {kpis.map((k) => (
              <div className="k" key={k.l}>
                <div className="kl">{k.l}</div>
                <div className="kv mono">{k.v}</div>
              </div>
            ))}
          </div>
        )}
        <div className="cv-inbox">
          {/* conversation list */}
          <section className="cv-convs">
            <div className="cv-convs-h cv-gfilters">
              <div className="cv-search">
                <GuestGlyph name="search" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" aria-label="Search conversations" />
              </div>
              <div className="cv-seg icons" role="group" aria-label="Filter conversations">
                {CONV_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={filter === f.key ? "on" : ""}
                    onClick={() => setFilter(f.key)}
                    title={f.label}
                    aria-label={f.label}
                    aria-pressed={filter === f.key}
                  >
                    <GuestGlyph name={f.icon} />
                  </button>
                ))}
              </div>
            </div>
            <div className="cv-conv-list">
              {filtered.length === 0 ? (
                <div className="cv-kds-empty pad">No conversations.</div>
              ) : (
                filtered.map((c) => (
                  <ConvRow key={c.phone} c={c} selected={c.phone === selected} onSelect={onSelect} />
                ))
              )}
            </div>
          </section>

          {/* thread */}
          <section className="cv-thread">
            {!selectedConv ? (
              <div className="cv-thread-empty">Select a conversation to read and reply.</div>
            ) : (
              <>
                <div className="cv-thread-h">
                  <span className="cv-av">{initials(selectedConv.customerName, selectedConv.phone)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{selectedConv.customerName || selectedConv.phone}</div>
                    <div className="meta">{selectedConv.phone} · WhatsApp</div>
                  </div>
                  <span className={`cv-window ${windowOpen ? "open" : "closed"}`}>24h · {windowOpen ? "open" : "closed"}</span>
                  <button className="cv-iconbtn" title={pinnedSet.has(selectedConv.phone) ? "Unpin" : "Pin"} onClick={() => void setFlag(selectedConv.phone, { pinned: !pinnedSet.has(selectedConv.phone) })}>
                    {pinnedSet.has(selectedConv.phone) ? "📌" : "📍"}
                  </button>
                  <button className="cv-iconbtn" title={archivedSet.has(selectedConv.phone) ? "Unarchive" : "Archive"} onClick={() => void setFlag(selectedConv.phone, { archived: !archivedSet.has(selectedConv.phone) })}>
                    🗄
                  </button>
                </div>
                <div className="cv-msgs" ref={msgsRef}>
                  {threadRows.length === 0 ? (
                    <div className="cv-kds-empty pad">No messages yet.</div>
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
                />
              </>
            )}
          </section>

          {/* context */}
          <aside className="cv-ctx">
            {selectedConv ? (
              <>
                <h4>Live order</h4>
                <div className="cv-ctx-card">
                  {selectedConv.cartCount > 0 ? (
                    <>
                      <div className="kv"><span>Cart</span><span className="mono">{selectedConv.cartCount} items · {zl(selectedConv.cartSubtotalGrosze)} zł</span></div>
                      <div className="kv"><span>Channel</span><span>{selectedConv.fulfillmentType ?? "—"}</span></div>
                      <div className="kv"><span>Payment</span><span className={selectedConv.pendingPaymentUrl ? "mono pay" : "mono"}>{selectedConv.pendingPaymentUrl ? "Awaiting" : "—"}</span></div>
                    </>
                  ) : (
                    <div className="cv-ctx-empty">No active cart.</div>
                  )}
                </div>
                <h4>Guest</h4>
                <div className="cv-ctx-card">
                  {rollup ? (
                    <>
                      <div className="kv"><b>{rollup.name || "Walk-in"}</b>{rollup.isMember && <span className="cv-tier">★ {rollup.tier}</span>}</div>
                      <div className="kv"><span>Lifetime</span><span className="mono">{zl(rollup.ltv)} zł · {rollup.visits} orders</span></div>
                    </>
                  ) : (
                    <div className="cv-ctx-empty">Loading…</div>
                  )}
                </div>
              </>
            ) : (
              <div className="cv-ctx-empty pad">Guest + order context appears here.</div>
            )}
          </aside>
        </div>
      </div>

      {/* conversion funnel */}
      <CoreV2Dialog open={funnelOpen} onClose={() => setFunnelOpen(false)} title="WhatsApp conversion funnel" width={560}>
        <div className="cv-funnel">
          <div className="cv-seg" style={{ marginBottom: 14 }}>
            {(["7d", "30d", "all"] as FunnelWindow[]).map((w) => (
              <button key={w} type="button" className={funnelWindow === w ? "on" : ""} onClick={() => setFunnelWindow(w)}>{w === "all" ? "All" : w}</button>
            ))}
          </div>
          {!funnel ? (
            <div className="cv-kds-empty pad">Loading funnel…</div>
          ) : (
            <>
              <div className="cv-funnel-kpis">
                <div><span className="sv mono">{funnel.startedCount}</span><span className="sl">Started</span></div>
                <div><span className="sv mono">{funnel.paidCount}</span><span className="sl">Paid</span></div>
                <div><span className="sv mono">{Math.round(funnel.conversionRate * 100)}%</span><span className="sl">Conversion</span></div>
                <div><span className="sv mono">{funnel.uniqueConversations}</span><span className="sl">Unique</span></div>
              </div>
              <div className="cv-funnel-stages">
                {funnel.stages.map((s) => (
                  <div key={s.stage} className="cv-funnel-stage">
                    <div className="row">
                      <span className="lab">{s.label}</span>
                      <span className="cnt mono">{s.count}<span className="pct"> · {Math.round(s.pctOfStart * 100)}%</span></span>
                    </div>
                    <div className="cv-track"><i style={{ width: `${Math.round(s.pctOfStart * 100)}%` }} /></div>
                    {s.dropFromPrev > 0 && <span className="drop">−{Math.round(s.dropFromPrev * 100)}% from previous step</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CoreV2Dialog>

      <WaBroadcastDialog open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <WaSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void loadAll()} />
    </CoreV2Shell>
  );
}
