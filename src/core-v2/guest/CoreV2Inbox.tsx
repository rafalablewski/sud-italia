"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
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
  const msgsRef = useRef<HTMLDivElement>(null);

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
      subRight={<span className="cv-chip" style={{ height: 32 }}><span className="dot" />WhatsApp live</span>}
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
                    thread.map((m, i) => (
                      <div key={i} className={`cv-bub ${m.actor}`}>
                        {m.body}
                        <span className="t">{m.actor === "operator" ? "You" : m.actor === "bot" ? "Bot" : ""} {clock(m.at)}</span>
                      </div>
                    ))
                  )}
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
                    placeholder="Type a reply… (Enter to send)"
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
    </CoreV2Shell>
  );
}
