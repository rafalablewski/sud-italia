"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  Maximize2,
  Megaphone,
  Minimize2,
  Pin,
  PinOff,
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
import { useWhatsappSimulator } from "@/lib/useWhatsappSimulator";

const MobileWhatsApp = dynamic(
  () => import("./mobile/MobileWhatsApp").then((m) => m.MobileWhatsApp),
  { ssr: false },
);
import { formatPrice } from "@/lib/utils";
import { loyaltyTier } from "@/lib/loyalty-tier";
import { GuestViewNav } from "./guest/GuestViewNav";
import { WhatsAppSettingsDialog } from "./whatsapp/WhatsAppSettingsDialog";
import { WhatsAppFunnelDialog } from "./whatsapp/WhatsAppFunnelDialog";
import { WhatsAppBroadcastDialog } from "./whatsapp/WhatsAppBroadcastDialog";

// ---- types --------------------------------------------------------------

interface WaSettings {
  enabled: boolean;
  reopenTemplate: string;
  autoArchiveMinutes: number;
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
  /** True for sandbox conversations staged by the chat simulator. */
  simulated: boolean;
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

type ConvFilter = "inbox" | "live" | "awaiting" | "archived";

/** The slice of the customer rollup the inbox shows beside a conversation. */
interface GuestRollup {
  name: string | null;
  tier: string;
  ltv: number;
  avg: number;
  visits: number;
  isMember: boolean;
  firstOrderAt: string | null;
}

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

/** A short day separator for the transcript ("Today" / "Yesterday" / a date). */
function dayLabel(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Operator quick-reply starters inserted into the composer (the operator still
 *  reviews + sends). "Payment link" is wired to the chat's live Stripe URL. */
const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "Menu", text: "Here's our menu:" },
  { label: "Payment link", text: "" },
  { label: "Reservation", text: "Happy to hold a table — what time works for you?" },
  { label: "Comp dessert", text: "Dessert's on us tonight 🍮" },
  { label: "Re-open template", text: "" },
];

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
      simulated: false,
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
          simulated: s.simulated,
        };
    merged.hasActiveSession = true;
    merged.simulated = s.simulated || merged.simulated;
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
  // Mirror the selection in a ref so async thread loads can tell whether their
  // result is still for the conversation currently on screen (guards against a
  // slow fetch for a previous phone resolving after the user switched).
  const selectedPhoneRef = useRef<string | null>(null);
  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);
  const [filter, setFilter] = useState<ConvFilter>("inbox");
  const [query, setQuery] = useState("");

  // Operator archive / pin flags (phones).
  const [archivedSet, setArchivedSet] = useState<Set<string>>(new Set());
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());

  // Thread (selected conversation transcript)
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  // Guest rollup for the selected conversation — the real CRM record (LTV,
  // tier, visits) so the context panel mirrors the Guests view.
  const [guest, setGuest] = useState<GuestRollup | null>(null);

  // Settings overlay (advanced config lives in WhatsAppSettingsDialog)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  // Fullscreen kiosk
  const [kiosk, setKiosk] = useState(false);
  const [clock, setClock] = useState("--:--:--");

  // Chat simulator (owner toggle in Settings). When on, the console flags
  // itself with a Sandbox tag next to the wordmark.
  const { enabled: simEnabled } = useWhatsappSimulator();

  // ---- data loaders -----------------------------------------------------

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sRes, cRes, hRes, mRes, fRes] = await Promise.all([
        fetch("/api/admin/whatsapp/settings"),
        fetch("/api/admin/whatsapp/sessions"),
        fetch("/api/admin/whatsapp/transcripts"),
        fetch("/api/admin/whatsapp/metrics"),
        fetch("/api/admin/whatsapp/flags"),
      ]);
      if (sRes.ok) {
        setSettings((await sRes.json()) as WaSettings);
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
      if (fRes.ok) {
        const f = (await fRes.json()) as { archived: string[]; pinned: string[] };
        setArchivedSet(new Set(f.archived));
        setPinnedSet(new Set(f.pinned));
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

  // Auto-archive (operator-console only): a conversation idle longer than the
  // configured window drops out of the active inbox into Archived. Recomputed
  // on every poll (10s) so it tracks the clock; a new message un-archives it
  // because lastAt refreshes. 0 minutes disables it.
  const archiveMs = (settings?.autoArchiveMinutes ?? 0) * 60_000;
  const isArchived = useCallback(
    (c: ConversationRow) => {
      if (pinnedSet.has(c.phone)) return false; // pinned stays in the inbox
      if (archivedSet.has(c.phone)) return true; // manually archived
      return archiveMs > 0 && Date.now() - Date.parse(c.lastAt) > archiveMs;
    },
    [archiveMs, archivedSet, pinnedSet],
  );

  const counts = useMemo(() => {
    let inbox = 0;
    let live = 0;
    let awaiting = 0;
    let archived = 0;
    for (const c of conversations) {
      if (isArchived(c)) {
        archived++;
        continue;
      }
      inbox++;
      if (c.hasActiveSession) live++;
      if (c.pendingPaymentUrl) awaiting++;
    }
    return { inbox, live, awaiting, archived };
  }, [conversations, isArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      const archived = isArchived(c);
      if (filter === "archived") {
        if (!archived) return false;
      } else {
        if (archived) return false;
        if (filter === "live" && !c.hasActiveSession) return false;
        if (filter === "awaiting" && !c.pendingPaymentUrl) return false;
      }
      if (q) {
        const hay = `${c.phone} ${c.customerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filter, query, isArchived]);

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
      // Ignore the result if the operator has since switched conversations —
      // a stale response must not overwrite the thread now on screen.
      if (phone !== selectedPhoneRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as { messages: WaMessage[] };
        if (phone === selectedPhoneRef.current) {
          setThread(Array.isArray(data.messages) ? data.messages : []);
        }
      } else {
        setThread([]);
      }
    } catch (err) {
      console.error("Failed to load WhatsApp thread", err);
    } finally {
      if (phone === selectedPhoneRef.current && !silent) setThreadLoading(false);
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

  // Pull the guest's real CRM rollup for the context panel. Guards against a
  // stale resolve when the operator switches conversations mid-fetch.
  useEffect(() => {
    if (!selectedPhone) {
      setGuest(null);
      return;
    }
    setGuest(null);
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/customers/${encodeURIComponent(selectedPhone)}`);
        if (!r.ok) return;
        const d = (await r.json()) as {
          member?: { name?: string | null } | null;
          totals?: {
            totalSpent?: number;
            avgOrderValue?: number;
            orderCount?: number;
            lifetimePoints?: number;
            firstOrderAt?: string | null;
          };
        };
        if (cancelled || selectedPhoneRef.current !== selectedPhone) return;
        const t = d.totals ?? {};
        setGuest({
          name: d.member?.name ?? null,
          tier: loyaltyTier(t.lifetimePoints ?? 0),
          ltv: t.totalSpent ?? 0,
          avg: t.avgOrderValue ?? 0,
          visits: t.orderCount ?? 0,
          isMember: !!d.member,
          firstOrderAt: t.firstOrderAt ?? null,
        });
      } catch {
        /* leave guest null — the panel falls back to session data */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPhone]);

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

  const setFlag = useCallback(
    async (phone: string, patchFlags: { archived?: boolean; pinned?: boolean }) => {
      const res = await fetch("/api/admin/whatsapp/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, ...patchFlags }),
      });
      if (res.ok) {
        const f = (await res.json()) as { archived: string[]; pinned: string[] };
        setArchivedSet(new Set(f.archived));
        setPinnedSet(new Set(f.pinned));
      } else {
        toast.error("Could not update conversation");
      }
    },
    [toast],
  );

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
    { value: "inbox", label: "Inbox", count: counts.inbox },
    { value: "live", label: "Live", count: counts.live },
    { value: "awaiting", label: "Awaiting pay", count: counts.awaiting },
    { value: "archived", label: "Archived", count: counts.archived },
  ];

  const page = (
    <div className={`wa-console${kiosk ? " is-fullscreen" : ""}`}>
      {loading && <div className="v2-page-loading">Loading WhatsApp…</div>}
      {/* Header */}
      <header className="cmd-head">
        <div className="cmd-brand">
          <span className="cmd-wordmark">SUD ITALIA</span>
          <span className="cmd-label">Guest Engagement</span>
          {simEnabled && <span className="wa-sim-tag">Sandbox</span>}
        </div>
        <GuestViewNav current="inbox" counts={{ inbox: counts.inbox }} />
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
          onClick={() => setBroadcastOpen(true)}
          title="Broadcast campaign"
        >
          <Megaphone />
          <span>Broadcast</span>
        </button>
        <button
          type="button"
          className="cmd-btn"
          onClick={() => setFunnelOpen(true)}
          title="Conversion funnel"
        >
          <BarChart3 />
          <span>Funnel</span>
        </button>
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

      {/* KPI strip — five channel headline metrics as cards (guest.html). */}
      <div className="wa-kpis" role="group" aria-label="Channel metrics">
        <div className="wa-kpi">
          <span className="wa-kpi-l">Orders · 7d</span>
          <span className="wa-kpi-v tnum">{m7 ? m7.orders.paid : "—"}</span>
          <span className="wa-kpi-h">paid via WhatsApp</span>
        </div>
        <div className="wa-kpi good">
          <span className="wa-kpi-l">Conversion · 7d</span>
          <span className="wa-kpi-v tnum">{m7 ? pct(m7.conversionRate) : "—"}</span>
          <span className="wa-kpi-h">chat → paid</span>
        </div>
        <div className="wa-kpi">
          <span className="wa-kpi-l">Active sessions</span>
          <span className="wa-kpi-v tnum">{af ? af.totalSessions : "—"}</span>
        </div>
        <div className="wa-kpi warn">
          <span className="wa-kpi-l">Awaiting pay</span>
          <span className="wa-kpi-v tnum">{af ? af.awaitingPayment : "—"}</span>
        </div>
        <div className="wa-kpi">
          <span className="wa-kpi-l">Lifetime paid</span>
          <span className="wa-kpi-v tnum">{mLife ? mLife.orders.paid : "—"}</span>
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
                placeholder="Search name, phone, order…"
                spellCheck={false}
                aria-label="Search conversations"
              />
            </div>
            <button type="button" className="wa-list-refresh" onClick={() => void loadAll()} title="Refresh">
              <RotateCw />
            </button>
          </div>
          <div className="wa-conv-tabs" role="group" aria-label="Conversation filters">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="wa-conv-tab"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span className="wa-chip-count tnum">{f.count}</span>
              </button>
            ))}
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
                  pinned={pinnedSet.has(c.phone)}
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
                {selected.simulated && <span className="wa-th-badge sim">sandbox</span>}
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
                  thread.map((m, i) => {
                    const day = dayLabel(m.at);
                    const prevDay = i > 0 ? dayLabel(thread[i - 1].at) : null;
                    return (
                      <Fragment key={i}>
                        {day && day !== prevDay && <div className="wa-day">{day}</div>}
                        <ThreadBubble message={m} />
                      </Fragment>
                    );
                  })
                )}
              </div>

              <div className="wa-composer">
                <div className="wa-quick" role="group" aria-label="Quick replies">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="wa-quick-chip"
                      onClick={() => {
                        if (q.label === "Re-open template") {
                          void sendTemplate();
                          return;
                        }
                        if (q.label === "Payment link") {
                          if (selected.pendingPaymentUrl) {
                            setReply((r) => `${r ? r + " " : ""}${selected.pendingPaymentUrl}`);
                          } else {
                            toast.info("No pending payment link for this chat");
                          }
                          return;
                        }
                        setReply((r) => (r ? `${r} ${q.text}` : q.text));
                      }}
                      disabled={q.label === "Re-open template" && (!templateName || sending)}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
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
                <div className="wa-ctx-eyebrow">Guest</div>
                <div className="wa-gp">
                  <span className="wa-gp-av">{initials(guest?.name ?? selected.customerName, selected.phone)}</span>
                  <div className="wa-gp-id">
                    <div className="wa-gp-nm">{guest?.name ?? selected.customerName ?? selected.phone}</div>
                    <div className="wa-gp-sub">
                      {[
                        guest?.isMember ? guest.tier : null,
                        guest && guest.visits > 0
                          ? `${guest.visits} visit${guest.visits === 1 ? "" : "s"}`
                          : "New guest",
                        guest?.firstOrderAt ? `since ${new Date(guest.firstOrderAt).getFullYear()}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="wa-gp-stats">
                  <div className="wa-gp-stat">
                    <span className="l">Lifetime value</span>
                    <span className="v tnum">{guest ? formatPrice(guest.ltv) : "—"}</span>
                  </div>
                  <div className="wa-gp-stat">
                    <span className="l">Avg spend</span>
                    <span className="v tnum">{guest ? formatPrice(guest.avg) : "—"}</span>
                  </div>
                </div>
                <a className="wa-gp-link" href="/admin/guest?view=guests">
                  Open full profile →
                </a>
                <div className="wa-ctx-row">
                  <span className="k">Phone</span>
                  <span className="v tnum">{selected.phone}</span>
                </div>
                <div className="wa-ctx-row">
                  <span className="k">Last activity</span>
                  <span className="v" title={fmtFull(selected.lastAt)}>{fmtAgo(selected.lastAt)} ago</span>
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
                <button
                  type="button"
                  className="wa-act-btn neutral"
                  onClick={() => void setFlag(selected.phone, { pinned: !pinnedSet.has(selected.phone) })}
                >
                  {pinnedSet.has(selected.phone) ? <PinOff /> : <Pin />}
                  <span>{pinnedSet.has(selected.phone) ? "Unpin" : "Pin to inbox"}</span>
                </button>
                <button
                  type="button"
                  className="wa-act-btn neutral"
                  onClick={() => void setFlag(selected.phone, { archived: !archivedSet.has(selected.phone) })}
                >
                  {archivedSet.has(selected.phone) ? <ArchiveRestore /> : <Archive />}
                  <span>{archivedSet.has(selected.phone) ? "Unarchive" : "Archive"}</span>
                </button>
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

      <WhatsAppSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => void loadAll(true)}
      />
      <WhatsAppFunnelDialog open={funnelOpen} onClose={() => setFunnelOpen(false)} />
      <WhatsAppBroadcastDialog open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
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
  pinned,
  onSelect,
}: {
  conv: ConversationRow;
  active: boolean;
  pinned: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`wa-conv${active ? " active" : ""}${conv.hasActiveSession ? " live" : ""}`}
      onClick={onSelect}
    >
      <span className={`wa-conv-av${conv.hasActiveSession ? " live" : " idle"}`}>
        {initials(conv.customerName, conv.phone)}
        <span className="wa-conv-av-ch" />
      </span>
      <div className="wa-conv-main">
        <div className="wa-conv-top">
          <span className="wa-conv-name">{conv.customerName || conv.phone}</span>
          {pinned && <Pin className="wa-conv-pin" />}
        </div>
        {conv.customerName && <div className="wa-conv-sub tnum">{conv.phone}</div>}
        <div className="wa-conv-snip">{conv.lastBody || "—"}</div>
        <div className="wa-conv-tags">
          {conv.simulated && <span className="wa-chip-mini sim">sim</span>}
          {conv.locationSlug && <span className="wa-chip-mini loc">{conv.locationSlug}</span>}
          {conv.cartCount > 0 && (
            <span className="wa-chip-mini">{conv.cartCount} item{conv.cartCount === 1 ? "" : "s"}</span>
          )}
          {conv.pendingPaymentUrl && <span className="wa-chip-mini pay">awaiting pay</span>}
        </div>
      </div>
      <span className="wa-conv-meta">
        <span className="wa-conv-ago tnum">{fmtAgo(conv.lastAt)}</span>
      </span>
    </button>
  );
}

/** Two-letter avatar initials from a name (or the phone's last digits). */
function initials(name: string | null, phone: string): string {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase();
  }
  return phone.replace(/\D/g, "").slice(-2) || "··";
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
