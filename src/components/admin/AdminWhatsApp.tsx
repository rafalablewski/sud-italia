"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCw,
  Search,
  Send,
  Settings as SettingsIcon,
  ShoppingCart,
  Truck,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileWhatsApp = dynamic(
  () => import("./mobile/MobileWhatsApp").then((m) => m.MobileWhatsApp),
  { ssr: false },
);
import {
  Button,
  Dialog,
  Input,
  Select,
  Textarea,
} from "./v2/ui";
import { formatPrice } from "@/lib/utils";

// ---- types --------------------------------------------------------------

interface WaSettings {
  enabled: boolean;
  welcomeMessage: string;
  optOutPhrases: string[];
  defaultLocation: "krakow" | "warszawa" | null;
  dailyMessageCap: number;
  reopenTemplate: string;
}

interface WaSessionRow {
  phone: string;
  locationSlug: "krakow" | "warszawa" | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  customerName: string | null;
  fulfillmentType: "takeout" | "delivery" | null;
  slotId: string | null;
  pendingOrderId: string | null;
  pendingPaymentUrl: string | null;
  lastTurnAt: string;
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
  /** Comes from active session when present, otherwise from transcript head. */
  customerName: string | null;
  locationSlug: "krakow" | "warszawa" | null;
  cartCount: number;
  cartSubtotalGrosze: number;
  fulfillmentType: "takeout" | "delivery" | null;
  slotId: string | null;
  pendingOrderId: string | null;
  pendingPaymentUrl: string | null;
  messageCount: number;
  lastBody: string;
  /** True when an active session row contributes to this conversation. */
  hasActiveSession: boolean;
}

type WaMessageDirection = "in" | "out";
type WaMessageKind =
  | "text"
  | "selection"
  | "location"
  | "buttons"
  | "list"
  | "cta_url"
  | "template"
  | "unsupported";
type WaMessageActor = "customer" | "bot" | "operator" | "system";

interface WaMessage {
  at: string;
  direction: WaMessageDirection;
  kind: WaMessageKind;
  body: string;
  meta?: Record<string, unknown>;
  actor: WaMessageActor;
}

interface OrdersWindow {
  count: number;
  paid: number;
  cancelled: number;
  pending: number;
  revenueGrosze: number;
  averageGrosze: number;
}
interface ActivityWindow {
  inboundMessages: number;
  outboundMessages: number;
  uniquePhones: number;
}
interface MetricsResponse {
  generatedAt: string;
  windows: {
    last7d: { orders: OrdersWindow; activity: ActivityWindow; conversionRate: number };
    last30d: { orders: OrdersWindow };
    lifetime: { orders: OrdersWindow };
  };
  activeSessions: {
    totalSessions: number;
    locationSet: number;
    cartHasItems: number;
    fulfillmentSet: number;
    slotPicked: number;
    awaitingPayment: number;
  };
  historicConversations: number;
}

type ConvFilter = "all" | "live" | "awaiting" | "idle";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- helpers ------------------------------------------------------------

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso || "—";
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function fmtFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function withinWindow(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < DAY_MS;
}

function actorLabel(m: WaMessage): string {
  return m.actor === "customer"
    ? "Customer"
    : m.actor === "operator"
      ? "You"
      : m.actor === "system"
        ? "System"
        : "Bot";
}

function kindLabel(m: WaMessage): string {
  switch (m.kind) {
    case "cta_url":
      return `CTA → ${typeof m.meta?.url === "string" ? m.meta.url : "link"}`;
    case "template":
      return `template: ${typeof m.meta?.templateName === "string" ? m.meta.templateName : "?"}`;
    case "list":
      return "interactive list";
    case "buttons":
      return "buttons";
    case "selection":
      return "tap";
    case "location":
      return "location";
    case "unsupported":
      return "unsupported";
    default:
      return "";
  }
}

function mergeConversations(
  sessions: WaSessionRow[],
  heads: TranscriptHead[],
): ConversationRow[] {
  const byPhone = new Map<string, ConversationRow>();
  for (const h of heads) {
    byPhone.set(h.phone, {
      phone: h.phone,
      lastAt: h.lastAt,
      customerName: null,
      locationSlug: null,
      cartCount: 0,
      cartSubtotalGrosze: 0,
      fulfillmentType: null,
      slotId: null,
      pendingOrderId: null,
      pendingPaymentUrl: null,
      messageCount: h.messageCount,
      lastBody: h.lastBody,
      hasActiveSession: false,
    });
  }
  for (const s of sessions) {
    const existing = byPhone.get(s.phone);
    const merged: ConversationRow = existing
      ? { ...existing }
      : {
          phone: s.phone,
          lastAt: s.lastTurnAt,
          customerName: s.customerName,
          locationSlug: s.locationSlug,
          cartCount: s.cartCount,
          cartSubtotalGrosze: s.cartSubtotalGrosze,
          fulfillmentType: s.fulfillmentType,
          slotId: s.slotId,
          pendingOrderId: s.pendingOrderId,
          pendingPaymentUrl: s.pendingPaymentUrl,
          messageCount: 0,
          lastBody: "",
          hasActiveSession: true,
        };
    merged.hasActiveSession = true;
    merged.customerName = s.customerName ?? merged.customerName;
    merged.locationSlug = s.locationSlug ?? merged.locationSlug;
    merged.cartCount = s.cartCount || merged.cartCount;
    merged.cartSubtotalGrosze = s.cartSubtotalGrosze || merged.cartSubtotalGrosze;
    merged.fulfillmentType = s.fulfillmentType ?? merged.fulfillmentType;
    merged.slotId = s.slotId ?? merged.slotId;
    merged.pendingOrderId = s.pendingOrderId ?? merged.pendingOrderId;
    merged.pendingPaymentUrl = s.pendingPaymentUrl ?? merged.pendingPaymentUrl;
    merged.lastAt = s.lastTurnAt > merged.lastAt ? s.lastTurnAt : merged.lastAt;
    byPhone.set(s.phone, merged);
  }
  const list = Array.from(byPhone.values());
  list.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return list;
}

// ---- main component -----------------------------------------------------

export function AdminWhatsApp() {
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileWhatsApp />;
  }
  return <AdminWhatsAppDesktop />;
}

function AdminWhatsAppDesktop() {
  const toast = useToast();

  const [settings, setSettings] = useState<WaSettings | null>(null);
  const [sessions, setSessions] = useState<WaSessionRow[]>([]);
  const [heads, setHeads] = useState<TranscriptHead[]>([]);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConvFilter>("all");
  const [query, setQuery] = useState("");

  // Thread (selected conversation transcript)
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  // Settings overlay drafts
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeDraft, setWelcomeDraft] = useState("");
  const [optOutDraft, setOptOutDraft] = useState("");
  const [reopenDraft, setReopenDraft] = useState("");
  const [capDraft, setCapDraft] = useState("60");

  // Fullscreen kiosk
  const [kiosk, setKiosk] = useState(false);
  const [clock, setClock] = useState("--:--:--");

  // ---- data loaders -----------------------------------------------------

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sRes, cRes, hRes, mRes] = await Promise.all([
        fetch("/api/admin/whatsapp/settings"),
        fetch("/api/admin/whatsapp/sessions"),
        fetch("/api/admin/whatsapp/transcripts"),
        fetch("/api/admin/whatsapp/metrics"),
      ]);
      if (sRes.ok) {
        const s = (await sRes.json()) as WaSettings;
        setSettings(s);
        setWelcomeDraft(s.welcomeMessage);
        setOptOutDraft(s.optOutPhrases.join(", "));
        setReopenDraft(s.reopenTemplate);
        setCapDraft(String(s.dailyMessageCap));
      }
      if (cRes.ok) {
        const list = (await cRes.json()) as WaSessionRow[];
        setSessions(Array.isArray(list) ? list : []);
      }
      if (hRes.ok) {
        const list = (await hRes.json()) as TranscriptHead[];
        setHeads(Array.isArray(list) ? list : []);
      }
      if (mRes.ok) {
        setMetrics((await mRes.json()) as MetricsResponse);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live sync — refresh sessions + heads on a steady cadence (cheap), metrics
  // less often (it re-reads orders). Mirrors the POS till's polling model.
  useEffect(() => {
    const lists = setInterval(() => void loadAll(true), 10_000);
    return () => clearInterval(lists);
  }, [loadAll]);

  const conversations = useMemo(
    () => mergeConversations(sessions, heads),
    [sessions, heads],
  );

  const counts = useMemo(() => {
    let live = 0;
    let awaiting = 0;
    let idle = 0;
    for (const c of conversations) {
      if (c.hasActiveSession) live++;
      else idle++;
      if (c.pendingPaymentUrl) awaiting++;
    }
    return { all: conversations.length, live, awaiting, idle };
  }, [conversations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "live" && !c.hasActiveSession) return false;
      if (filter === "awaiting" && !c.pendingPaymentUrl) return false;
      if (filter === "idle" && c.hasActiveSession) return false;
      if (q) {
        const hay = `${c.phone} ${c.customerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filter, query]);

  // Keep a valid selection: auto-select the first row once loaded, and clear a
  // selection that filtered out so the thread pane never points at nothing.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedPhone(null);
      return;
    }
    setSelectedPhone((cur) =>
      cur && filtered.some((c) => c.phone === cur) ? cur : filtered[0].phone,
    );
  }, [filtered]);

  const selected = useMemo(
    () => conversations.find((c) => c.phone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  );

  // ---- thread -----------------------------------------------------------

  const loadThread = useCallback(async (phone: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/transcripts/${encodeURIComponent(phone)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: WaMessage[] };
        setThread(Array.isArray(data.messages) ? data.messages : []);
      } else {
        setThread([]);
      }
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPhone) {
      setThread([]);
      return;
    }
    setReply("");
    void loadThread(selectedPhone);
    const id = setInterval(() => void loadThread(selectedPhone, true), 6_000);
    return () => clearInterval(id);
  }, [selectedPhone, loadThread]);

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [thread]);

  // ---- mutations --------------------------------------------------------

  const patch = useCallback(
    async (updates: Partial<WaSettings>) => {
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setSettings((await res.json()) as WaSettings);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      toast.error("Could not save", data?.error || "Try again.");
      return false;
    },
    [toast],
  );

  const toggleEnabled = async () => {
    if (!settings) return;
    const ok = await patch({ enabled: !settings.enabled });
    if (ok) toast.success(`WhatsApp ${settings.enabled ? "disabled" : "enabled"}`);
  };

  const saveTextSettings = async () => {
    const optOutPhrases = optOutDraft
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const dailyMessageCap = Math.max(
      1,
      Math.min(10000, Number.parseInt(capDraft, 10) || 60),
    );
    const ok = await patch({
      welcomeMessage: welcomeDraft,
      optOutPhrases,
      reopenTemplate: reopenDraft,
      dailyMessageCap,
    });
    if (ok) {
      toast.success("WhatsApp settings saved");
      setSettingsOpen(false);
    }
  };

  const setDefaultLocation = async (val: string) => {
    const next = val === "krakow" || val === "warszawa" ? (val as "krakow" | "warszawa") : null;
    const ok = await patch({ defaultLocation: next });
    if (ok) toast.success("Default location updated");
  };

  const resetSession = async (phone: string) => {
    const res = await fetch(
      `/api/admin/whatsapp/sessions/${encodeURIComponent(phone)}/reset`,
      { method: "POST" },
    );
    if (res.ok) {
      toast.success(`Session reset for ${phone}`);
      setSessions((arr) => arr.filter((s) => s.phone !== phone));
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Could not reset", data?.error || "Try again.");
    }
  };

  const send = async () => {
    if (!selectedPhone || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/sessions/${encodeURIComponent(selectedPhone)}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: reply }),
        },
      );
      if (res.ok) {
        toast.success("Message sent");
        setReply("");
        await loadThread(selectedPhone, true);
        await loadAll(true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not send", data?.error || "Customer may be outside the 24h window.");
      }
    } finally {
      setSending(false);
    }
  };

  const sendTemplate = async () => {
    if (!selectedPhone) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/sessions/${encodeURIComponent(selectedPhone)}/template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        toast.success(`Template "${settings?.reopenTemplate}" sent`);
        await loadThread(selectedPhone, true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not send template", data?.error || "Check the configured template name.");
      }
    } finally {
      setSending(false);
    }
  };

  // ---- fullscreen + clock ----------------------------------------------

  const enterKiosk = useCallback(() => {
    setKiosk(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const exitKiosk = useCallback(() => {
    setKiosk(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!kiosk) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [kiosk]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ---- keyboard ---------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (kiosk) exitKiosk();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        if (kiosk) exitKiosk();
        else enterKiosk();
        return;
      }
      if (k === "j" || k === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const dir = k === "j" || e.key === "ArrowDown" ? 1 : -1;
        const idx = filtered.findIndex((c) => c.phone === selectedPhone);
        const next = Math.max(0, Math.min(filtered.length - 1, (idx < 0 ? 0 : idx) + dir));
        setSelectedPhone(filtered[next].phone);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedPhone, kiosk, enterKiosk, exitKiosk, settingsOpen]);

  // ---- derived ----------------------------------------------------------

  const m7 = metrics?.windows.last7d;
  const af = metrics?.activeSessions;
  const mLife = metrics?.windows.lifetime;
  const templateName = settings?.reopenTemplate ?? "";
  const windowOpen = selected ? withinWindow(selected.lastAt) : false;

  const FILTERS: { value: ConvFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "live", label: "Live", count: counts.live },
    { value: "awaiting", label: "Awaiting pay", count: counts.awaiting },
    { value: "idle", label: "Idle", count: counts.idle },
  ];

  const page = (
    <div className={`wa-console${kiosk ? " is-fullscreen" : ""}`}>
      {/* Header */}
      <header className="cmd-head">
        <div className="cmd-brand">
          <span className="cmd-wordmark">SUD ITALIA</span>
          <span className="cmd-label">WhatsApp Console</span>
        </div>
        <button
          type="button"
          className="cmd-btn wa-power"
          aria-pressed={!!settings?.enabled}
          onClick={toggleEnabled}
          disabled={!settings}
          title={settings?.enabled ? "Channel live — click to disable" : "Channel off — click to enable"}
        >
          <span className={`wa-power-dot${settings?.enabled ? " on" : ""}`} />
          {settings?.enabled ? "Live" : "Off"}
        </button>
        <div className="cmd-spacer" />
        <button
          type="button"
          className="cmd-btn"
          onClick={() => setSettingsOpen(true)}
          title="Channel settings"
        >
          <SettingsIcon />
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="cmd-btn"
          aria-pressed={kiosk}
          onClick={kiosk ? exitKiosk : enterKiosk}
          title={kiosk ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
        >
          {kiosk ? <Minimize2 /> : <Maximize2 />}
          <span>{kiosk ? "Exit" : "Fullscreen"}</span>
        </button>
        <div className="cmd-clock tnum">{clock}</div>
      </header>

      {/* Stats + filters strip */}
      <div className="cmd-subbar wa-stats" role="group" aria-label="Channel metrics and filters">
        <span className="wa-stat">Orders 7d <b className="tnum">{m7 ? m7.orders.paid : "—"}</b></span>
        <span className="wa-stat-sep" />
        <span className="wa-stat">Conv 7d <b className="tnum">{m7 ? pct(m7.conversionRate) : "—"}</b></span>
        <span className="wa-stat-sep" />
        <span className="wa-stat">Active <b className="tnum">{af ? af.totalSessions : "—"}</b></span>
        <span className="wa-stat-sep" />
        <span className="wa-stat">Awaiting pay <b className="tnum">{af ? af.awaitingPayment : "—"}</b></span>
        <span className="wa-stat-sep" />
        <span className="wa-stat">Lifetime <b className="tnum">{mLife ? mLife.orders.paid : "—"}</b></span>
        <div className="wa-filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="cmd-chip"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="wa-chip-count tnum">{f.count}</span>
            </button>
          ))}
          <button
            type="button"
            className="cmd-btn"
            onClick={() => void loadAll()}
            title="Refresh"
          >
            <RotateCw />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 3-pane editor */}
      <div className="wa-editor">
        {/* LEFT — conversation list */}
        <aside className="wa-list" aria-label="Conversations">
          <div className="wa-list-search">
            <div className="wa-search-box">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search phone or name…"
                spellCheck={false}
                aria-label="Search conversations"
              />
            </div>
          </div>
          <div className="wa-list-scroll">
            {loading ? (
              <div className="wa-list-msg">Loading conversations…</div>
            ) : filtered.length === 0 ? (
              <div className="wa-list-msg">
                {conversations.length === 0
                  ? "No conversations yet. Inbound WhatsApp messages appear here."
                  : "No conversations match this filter."}
              </div>
            ) : (
              filtered.map((c) => (
                <ConvItem
                  key={c.phone}
                  conv={c}
                  active={c.phone === selectedPhone}
                  onSelect={() => setSelectedPhone(c.phone)}
                />
              ))
            )}
          </div>
        </aside>

        {/* CENTER — chat thread */}
        <section className="wa-thread" aria-label="Conversation thread">
          {!selected ? (
            <div className="wa-empty">
              <span className="wa-empty-emoji">💬</span>
              <span className="wa-empty-text">Select a conversation to read and reply.</span>
            </div>
          ) : (
            <>
              <div className="wa-thread-head">
                <span className={`wa-th-dot${selected.hasActiveSession ? " live" : ""}`} />
                <span className="wa-th-id tnum">{selected.phone}</span>
                {selected.customerName && <span className="wa-th-name">{selected.customerName}</span>}
                {selected.locationSlug && (
                  <span className="wa-th-badge loc">{selected.locationSlug}</span>
                )}
                <span className={`wa-th-badge window${windowOpen ? " open" : ""}`}>
                  <Clock /> {windowOpen ? "24h open" : "window closed"}
                </span>
              </div>

              <div className="wa-msgs" ref={msgsRef}>
                {threadLoading && thread.length === 0 ? (
                  <div className="wa-list-msg">Loading transcript…</div>
                ) : thread.length === 0 ? (
                  <div className="wa-list-msg">No messages yet.</div>
                ) : (
                  thread.map((m, i) => <ThreadBubble key={i} message={m} />)
                )}
              </div>

              <div className="wa-composer">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  maxLength={1024}
                  placeholder={
                    windowOpen
                      ? "Type a reply…"
                      : "Window closed — send the re-open template, then reply."
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="wa-composer-row">
                  <span className="wa-composer-hint">
                    {templateName ? (
                      <>
                        Re-open template: <code>{templateName}</code>
                      </>
                    ) : (
                      "No re-open template set (Settings)."
                    )}
                  </span>
                  <button
                    type="button"
                    className="wa-tmpl-btn"
                    onClick={() => void sendTemplate()}
                    disabled={!templateName || sending}
                  >
                    <ArrowDownToLine />
                    <span>Template</span>
                  </button>
                  <button
                    type="button"
                    className="wa-send-btn"
                    onClick={() => void send()}
                    disabled={!reply.trim() || sending}
                  >
                    <Send />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* RIGHT — context + actions */}
        <aside className="wa-context" aria-label="Conversation context">
          {!selected ? (
            <div className="wa-empty">
              <span className="wa-empty-text">No conversation selected.</span>
            </div>
          ) : (
            <>
              <div className="wa-ctx-sec">
                <div className="wa-ctx-eyebrow">Customer</div>
                <div className="wa-ctx-row">
                  <span className="k">Name</span>
                  <span className="v">{selected.customerName || "—"}</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k">Phone</span>
                  <span className="v">{selected.phone}</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k">Last activity</span>
                  <span className="v" title={fmtFull(selected.lastAt)}>{fmtAgo(selected.lastAt)} ago</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k">Messages</span>
                  <span className="v">{selected.messageCount || "—"}</span>
                </div>
              </div>

              <div className="wa-ctx-sec">
                <div className="wa-ctx-eyebrow">Order in progress</div>
                <div className="wa-ctx-row">
                  <span className="k"><MapPin /> Location</span>
                  <span className="v">{selected.locationSlug || "—"}</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k"><ShoppingCart /> Cart</span>
                  <span className="v">
                    {selected.cartCount > 0
                      ? `${selected.cartCount} · ${formatPrice(selected.cartSubtotalGrosze)}`
                      : "empty"}
                  </span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k"><Truck /> Fulfillment</span>
                  <span className="v">{selected.fulfillmentType || "—"}</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k"><CreditCard /> Pending</span>
                  <span className="v">{selected.pendingOrderId || "—"}</span>
                </div>
                {selected.pendingPaymentUrl && (
                  <a
                    className="wa-ctx-link"
                    href={selected.pendingPaymentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink /> Open Stripe pay link
                  </a>
                )}
              </div>

              {selected.hasActiveSession && (
                <div className="wa-ctx-sec">
                  <div className="wa-ctx-eyebrow">Funnel</div>
                  <div className="wa-funnel">
                    <FunnelStep label="Location set" done={!!selected.locationSlug} />
                    <FunnelStep label="Has cart" done={selected.cartCount > 0} />
                    <FunnelStep label="Fulfillment" done={!!selected.fulfillmentType} />
                    <FunnelStep label="Slot picked" done={!!selected.slotId} />
                    <FunnelStep label="Awaiting payment" done={!!selected.pendingPaymentUrl} />
                  </div>
                </div>
              )}

              <div className="wa-ctx-actions">
                {selected.hasActiveSession && (
                  <button
                    type="button"
                    className="wa-act-btn"
                    onClick={() => void resetSession(selected.phone)}
                  >
                    <RotateCw />
                    <span>Reset session</span>
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Settings — standard admin Dialog (portaled to body, rule #4). */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        size="md"
        title="WhatsApp channel settings"
        description="The webhook keeps verifying signatures even when the channel is off; the bot just replies that ordering is paused."
        footer={
          <>
            <Button
              variant={settings?.enabled ? "danger" : "primary"}
              onClick={toggleEnabled}
              disabled={!settings}
            >
              {settings?.enabled ? "Disable channel" : "Enable channel"}
            </Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveTextSettings}>
              Save settings
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="admin-text text-xs uppercase tracking-wide block mb-1">
              Welcome message (sent on first inbound)
            </label>
            <Textarea
              value={welcomeDraft}
              onChange={(e) => setWelcomeDraft(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Cześć! Tu Sud Italia 🍕 Napisz, na co masz ochotę…"
            />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="admin-text text-xs uppercase tracking-wide block mb-1">
                Opt-out keywords (comma-separated)
              </label>
              <Input
                value={optOutDraft}
                onChange={(e) => setOptOutDraft(e.target.value)}
                placeholder="STOP, NIE, UNSUBSCRIBE"
              />
            </div>
            <div>
              <label className="admin-text text-xs uppercase tracking-wide block mb-1">
                Default location (fallback)
              </label>
              <Select
                value={settings?.defaultLocation ?? ""}
                onChange={(e) => setDefaultLocation(e.target.value)}
                options={[
                  { value: "", label: "Ask the customer" },
                  { value: "krakow", label: "Kraków" },
                  { value: "warszawa", label: "Warszawa" },
                ]}
              />
            </div>
            <div>
              <label className="admin-text text-xs uppercase tracking-wide block mb-1">
                Daily inbound cap / phone
              </label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={capDraft}
                onChange={(e) => setCapDraft(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="admin-text text-xs uppercase tracking-wide block mb-1">
              Approved Meta template for re-opening the 24h window
            </label>
            <Input
              value={reopenDraft}
              onChange={(e) => setReopenDraft(e.target.value)}
              placeholder="sud_italia_order_update"
            />
            <p className="text-xs admin-text-secondary mt-1">
              Used by the Template button in a thread when the customer is outside the 24-hour messaging window.
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );

  // Kiosk renders through a portal to document.body so the edge-to-edge console
  // escapes the admin shell's stacking context (CLAUDE.md rule #4); the subtree
  // stays mounted, so polling, the thread feed and timers keep running.
  return kiosk ? createPortal(page, document.body) : page;
}

// ---- subcomponents ------------------------------------------------------

function ConvItem({
  conv,
  active,
  onSelect,
}: {
  conv: ConversationRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`wa-conv${active ? " active" : ""}${conv.hasActiveSession ? " live" : ""}`}
      onClick={onSelect}
    >
      <div className="wa-conv-top">
        <span className="wa-conv-dot" />
        <span className="wa-conv-name">{conv.customerName || conv.phone}</span>
        <span className="wa-conv-ago tnum">{fmtAgo(conv.lastAt)}</span>
      </div>
      {conv.customerName && <div className="wa-conv-sub tnum">{conv.phone}</div>}
      <div className="wa-conv-snip">{conv.lastBody || "—"}</div>
      <div className="wa-conv-tags">
        {conv.locationSlug && <span className="wa-chip-mini loc">{conv.locationSlug}</span>}
        {conv.cartCount > 0 && (
          <span className="wa-chip-mini">{conv.cartCount} item{conv.cartCount === 1 ? "" : "s"}</span>
        )}
        {conv.pendingPaymentUrl && <span className="wa-chip-mini pay">awaiting pay</span>}
      </div>
    </button>
  );
}

function ThreadBubble({ message }: { message: WaMessage }) {
  const isOut = message.direction === "out";
  const variant =
    message.actor === "operator"
      ? "operator"
      : message.actor === "system"
        ? "system"
        : isOut
          ? "out"
          : "in";
  const kind = kindLabel(message);
  return (
    <div className={`wa-bubble-row ${isOut ? "out" : "in"}`}>
      <div className={`wa-bubble ${variant}`}>
        <div className="wa-bubble-meta">
          <span>{actorLabel(message)}</span>
          {kind && <span className="wa-bubble-kind">{kind}</span>}
          <span className="wa-bubble-time tnum" title={fmtFull(message.at)}>
            {fmtAgo(message.at)}
          </span>
        </div>
        <div className="wa-bubble-body">
          {message.body || <span className="wa-bubble-empty">(empty)</span>}
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className={`wa-funnel-step${done ? " done" : ""}`}>
      {done ? <CheckCircle2 /> : <Circle />}
      <span>{label}</span>
    </div>
  );
}
