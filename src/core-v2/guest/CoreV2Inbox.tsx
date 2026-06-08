"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { guestTabs } from "./guestTabs";

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
  flows: unknown[];
}
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
        </div>
      )}
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
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [query, setQuery] = useState("");
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [funnelWindow, setFunnelWindow] = useState<FunnelWindow>("7d");
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    const id = setInterval(loadAll, 10000);
    return () => clearInterval(id);
  }, [loadAll]);

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
    const id = setInterval(() => loadThread(selected), 6000);
    return () => clearInterval(id);
  }, [selected, loadThread]);

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

  const selectedConv = conversations.find((c) => c.phone === selected) ?? null;

  // WhatsApp's 24h customer-service window: free-text replies only land while
  // the last inbound message is < 24h old; otherwise a template must reopen it.
  const windowOpen = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === "in") return Date.now() - new Date(thread[i].at).getTime() < 24 * 3600 * 1000;
    }
    return false;
  }, [thread]);

  const insertReply = (text: string | null) => {
    if (!text) {
      toast("No payment link on this conversation yet", "danger");
      return;
    }
    setReply((r) => (r.trim() ? `${r.trim()} ${text}` : text));
  };

  const send = async () => {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/sessions/${encodeURIComponent(selected)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      if (res.ok) {
        setReply("");
        await loadThread(selected);
        toast("Message sent", "success");
      } else {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "Outside the 24h window — send a template to reopen", "danger");
      }
    } finally {
      setSending(false);
    }
  };

  const setFlag = async (phone: string, patch: { archived?: boolean; pinned?: boolean }) => {
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
  };

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
          <button type="button" className="cv-btn ghost sm" onClick={() => setFunnelOpen(true)}>Funnel</button>
          <button type="button" className="cv-btn ghost sm" onClick={() => setSettingsOpen(true)}>Settings</button>
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
            <div className="cv-convs-h">
              <div className="cv-search">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" aria-label="Search conversations" />
              </div>
              <div className="cv-convfilters">
                {(["inbox", "live", "awaiting", "archived"] as Filter[]).map((f) => (
                  <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="cv-conv-list">
              {filtered.length === 0 ? (
                <div className="cv-kds-empty pad">No conversations.</div>
              ) : (
                filtered.map((c) => (
                  <button key={c.phone} className={c.phone === selected ? "cv-conv on" : "cv-conv"} onClick={() => setSelected(c.phone)}>
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
                  {thread.length === 0 ? (
                    <div className="cv-kds-empty pad">No messages yet.</div>
                  ) : (
                    (() => {
                      let lastDay = "";
                      return thread.map((m, i) => {
                        const dk = new Date(m.at).toDateString();
                        const sep = dk !== lastDay;
                        lastDay = dk;
                        return (
                          <Fragment key={i}>
                            {sep && <div className="cv-day-sep"><span>{dayLabel(m.at)}</span></div>}
                            <div className={`cv-bub ${m.actor}`}>
                              {m.body}
                              <span className="t">{m.actor === "operator" ? "You" : m.actor === "bot" ? "Bot" : m.actor === "system" ? "System" : ""} {clock(m.at)}</span>
                            </div>
                          </Fragment>
                        );
                      });
                    })()
                  )}
                </div>
                <div className="cv-quickreplies">
                  {QUICK_REPLIES.map((q) => (
                    <button key={q.label} type="button" onClick={() => insertReply(q.text(selectedConv.pendingPaymentUrl))}>
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
                        void send();
                      }
                    }}
                    placeholder={windowOpen ? "Type a reply… (Enter to send)" : "24h window closed — a template is needed to reopen"}
                    rows={1}
                  />
                  <button className="cv-send-msg" disabled={!reply.trim() || sending} onClick={() => void send()}>
                    ➤
                  </button>
                </div>
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

      <WaSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void loadAll()} />
    </CoreV2Shell>
  );
}
