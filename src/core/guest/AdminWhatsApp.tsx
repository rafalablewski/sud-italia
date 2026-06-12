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
  ExternalLink,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  RotateCw,
  Search,
} from "lucide-react";
import { CoreShell } from "@/core/shell/CoreShell";
import { Skeleton, SkeletonList } from "@/core/shared/Skeleton";
import { useToast } from "@/ui/Toast";

import { formatPrice } from "@/lib/utils";
import { loyaltyTier } from "@/lib/loyalty-tier";
import { GuestViewNav } from "@/core/guest/GuestViewNav";
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
  /** True for synthetic / sandbox conversations (reserved; never set by the live bot). */
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

/** "since 2023" from a first-order timestamp — null for a missing or
 *  unparseable date (so a malformed timestamp never renders "since NaN"). */
function sinceYear(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `since ${d.getFullYear()}`;
}

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
    <CoreShell
      eyebrow="Guest Engagement"
      viewnav={<GuestViewNav current="inbox" counts={{ inbox: counts.inbox }} />}
      right={
        <>
          <button
            type="button"
            className={`badge ${settings?.enabled ? "success" : "neutral"}`}
            style={{ cursor: "pointer", border: 0 }}
            onClick={toggleEnabled}
            disabled={!settings}
            title={settings?.enabled ? "Channel live — click to disable" : "Channel off — click to enable"}
          >
            <span className="d" />
            WhatsApp {settings?.enabled ? "live" : "off"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setFunnelOpen(true)}>
            Funnel
          </button>
          <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button type="button" className="btn primary" onClick={() => setBroadcastOpen(true)}>
            Broadcast
          </button>
          <button
            type="button"
            className="btn icon"
            onClick={kiosk ? exitKiosk : enterKiosk}
            title={kiosk ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
          >
            {kiosk ? <Minimize2 /> : <Maximize2 />}
          </button>
        </>
      }
    >
      <div className="intro">
        <h1>Guest · Inbox — the WhatsApp till</h1>
        <p>
          Two-way WhatsApp Business: the bot answers menu / availability / allergen questions and
          issues Stripe payment links; staff take over any thread. KPIs track chat → paid conversion.
          Quick replies + a payment-link button live in the composer.
        </p>
      </div>

      <div className="kpis k5">
        <div className="bk">
          <div className="l">Orders · 7d</div>
          <div className="v tnum">{m7 ? m7.orders.paid : "—"}</div>
          <div className="s">paid via WhatsApp</div>
        </div>
        <div className="bk">
          <div className="l">Conversion · 7d</div>
          <div className="v good tnum">{m7 ? pct(m7.conversionRate) : "—"}</div>
          <div className="s">chat → paid</div>
        </div>
        <div className="bk">
          <div className="l">Active sessions</div>
          <div className="v tnum">{af ? af.totalSessions : "—"}</div>
          <div className="s">live now</div>
        </div>
        <div className="bk">
          <div className="l">Awaiting pay</div>
          <div className="v warn tnum">{af ? af.awaitingPayment : "—"}</div>
          <div className="s">link sent</div>
        </div>
        <div className="bk">
          <div className="l">Lifetime paid</div>
          <div className="v tnum">{mLife ? mLife.orders.paid : "—"}</div>
          <div className="s">orders</div>
        </div>
      </div>

      <div className="filters wa-filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`fchip${filter === f.value ? " on" : ""}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label} <span className="n">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="guest">
        <section className="convs">
          <div className="convs-h">
            <div className="conv-search">
              <Search />
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, order…"
                spellCheck={false}
                aria-label="Search conversations"
              />
            </div>
          </div>
          <div className="conv-list">
            {loading ? (
              <SkeletonList rows={7} avatar />
            ) : filtered.length === 0 ? (
              <div className="pane-msg">
                {conversations.length === 0
                  ? "No conversations yet. Inbound WhatsApp messages appear here."
                  : "No conversations match this filter."}
              </div>
            ) : (
              filtered.map((c) => (
                <ConvCard
                  key={c.phone}
                  conv={c}
                  active={c.phone === selectedPhone}
                  pinned={pinnedSet.has(c.phone)}
                  onSelect={() => setSelectedPhone(c.phone)}
                />
              ))
            )}
          </div>
        </section>

        <section className="thread">
          {!selected ? (
            <div className="thread-empty">Select a conversation to read and reply.</div>
          ) : (
            <>
              <div className="thread-h">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">{selected.customerName || selected.phone}</div>
                  <div className="subtle" style={{ fontSize: 11 }}>
                    {selected.phone} · WhatsApp
                    {selected.simulated && " · sandbox"}
                    {selected.locationSlug && ` · ${selected.locationSlug}`}
                  </div>
                </div>
                <span className={`win ${windowOpen ? "open" : "closed"}`}>
                  24h window · {windowOpen ? "open" : "closed"}
                </span>
                <button
                  type="button"
                  className="btn ghost icon"
                  title={pinnedSet.has(selected.phone) ? "Unpin" : "Pin to inbox"}
                  onClick={() => void setFlag(selected.phone, { pinned: !pinnedSet.has(selected.phone) })}
                >
                  {pinnedSet.has(selected.phone) ? <PinOff /> : <Pin />}
                </button>
                <button
                  type="button"
                  className="btn ghost icon"
                  title={archivedSet.has(selected.phone) ? "Unarchive" : "Archive"}
                  onClick={() => void setFlag(selected.phone, { archived: !archivedSet.has(selected.phone) })}
                >
                  {archivedSet.has(selected.phone) ? <ArchiveRestore /> : <Archive />}
                </button>
                {selected.hasActiveSession && (
                  <button
                    type="button"
                    className="btn ghost icon"
                    title="Reset session"
                    onClick={() => void resetSession(selected.phone)}
                  >
                    <RotateCw />
                  </button>
                )}
              </div>

              <div className="thread-body" ref={msgsRef}>
                {threadLoading && thread.length === 0 ? (
                  <div
                    className="skel-list"
                    role="status"
                    aria-busy="true"
                    aria-label="Loading transcript"
                    style={{ padding: 14, gap: 12 }}
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton
                        key={i}
                        h={34}
                        r={12}
                        w={i % 2 ? "48%" : "62%"}
                        style={{ marginLeft: i % 2 ? "auto" : undefined }}
                      />
                    ))}
                  </div>
                ) : thread.length === 0 ? (
                  <div className="pane-msg">No messages yet.</div>
                ) : (
                  thread.map((m, i) => {
                    const day = dayLabel(m.at);
                    const prevDay = i > 0 ? dayLabel(thread[i - 1].at) : null;
                    return (
                      <Fragment key={i}>
                        {day && day !== prevDay && <div className="day">{day}</div>}
                        <Bubble message={m} />
                      </Fragment>
                    );
                  })
                )}
              </div>

              <div className="composer">
                <div className="composer-quick">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="chip"
                      disabled={q.label === "Re-open template" && (!templateName || sending)}
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
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <div className="composer-row">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
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
                  <button
                    type="button"
                    className="btn primary lg"
                    onClick={() => void send()}
                    disabled={!reply.trim() || sending}
                  >
                    Send
                  </button>
                </div>
                <div className="hint">
                  {windowOpen ? (
                    <>Inside 24h service window — free-text allowed.</>
                  ) : (
                    <>
                      Window closed — only the <b>{templateName || "welcome_back"}</b> template can re-open.
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="ctx">
          {selected && (
            <>
              <div className="ctx-sec">
                <div className="eyebrow">Live order</div>
                <div className="kv">
                  <span className="k">Location</span>
                  <span className="v">{selected.locationSlug || "—"}</span>
                </div>
                <div className="kv">
                  <span className="k">Cart</span>
                  <span className="v mono">
                    {selected.cartCount > 0
                      ? `${selected.cartCount} items · ${formatPrice(selected.cartSubtotalGrosze)}`
                      : "empty"}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">Fulfillment</span>
                  <span className="v">{selected.fulfillmentType || "—"}</span>
                </div>
                <div className="kv">
                  <span className="k">Pending order</span>
                  <span className="v mono">{selected.pendingOrderId || "—"}</span>
                </div>
                {selected.pendingPaymentUrl && (
                  <a className="paylink" href={selected.pendingPaymentUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open Stripe pay link →
                  </a>
                )}
              </div>
              {selected.hasActiveSession && (
                <div className="ctx-sec">
                  <div className="eyebrow">Conversion funnel</div>
                  <Check label="Location set" done={!!selected.locationSlug} />
                  <Check label="Cart has items" done={selected.cartCount > 0} />
                  <Check label="Fulfillment chosen" done={!!selected.fulfillmentType} />
                  <Check label="Slot picked" done={!!selected.slotId} />
                  <Check label="Awaiting payment" done={!!selected.pendingPaymentUrl} />
                </div>
              )}
              <div className="ctx-sec" style={{ borderBottom: 0 }}>
                <div className="eyebrow">Guest</div>
                <div className="gp">
                  <div className="av">{initials(guest?.name ?? selected.customerName, selected.phone)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{guest?.name ?? selected.customerName ?? selected.phone}</div>
                    <div className="sub">
                      {[
                        guest?.isMember ? guest.tier : null,
                        guest && guest.visits > 0
                          ? `${guest.visits} visit${guest.visits === 1 ? "" : "s"}`
                          : "New guest",
                        sinceYear(guest?.firstOrderAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="gp-stats">
                  <div className="gp-stat">
                    <div className="l">Lifetime value</div>
                    <div className="v">{guest ? formatPrice(guest.ltv) : "—"}</div>
                  </div>
                  <div className="gp-stat">
                    <div className="l">Avg spend</div>
                    <div className="v">{guest ? formatPrice(guest.avg) : "—"}</div>
                  </div>
                </div>
                <a className="gp-link" href="/core/guest/crm">
                  Open full profile →
                </a>
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
    </CoreShell>
  );

  // Kiosk renders through a portal to document.body so the edge-to-edge console
  // escapes the admin shell's stacking context (CLAUDE.md rule #4); the subtree
  // stays mounted, so polling, the thread feed and timers keep running.
  return kiosk ? createPortal(page, document.getElementById("admin-portal-root") ?? document.body) : page;
}

// ---- subcomponents ------------------------------------------------------

function ConvCard({
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
    <button type="button" className={`conv${active ? " on" : ""}`} onClick={onSelect}>
      <div className={`av${conv.hasActiveSession ? "" : " idle"}`}>
        {initials(conv.customerName, conv.phone)}
        <span className="ch" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="nm">
          {conv.customerName || conv.phone}
          {pinned && <Pin width={12} height={12} style={{ color: "var(--fg-subtle)" }} />}
        </div>
        <div className="msg">{conv.lastBody || "—"}</div>
        <div className="ctags">
          {conv.simulated && <span className="mtag sim">sim</span>}
          {conv.locationSlug && <span className="mtag">{conv.locationSlug}</span>}
          {conv.cartCount > 0 && (
            <span className="mtag">
              {conv.cartCount} item{conv.cartCount === 1 ? "" : "s"}
            </span>
          )}
          {conv.pendingPaymentUrl && <span className="mtag pay">awaiting pay</span>}
        </div>
      </div>
      <div className="meta">
        <div className="tm">{fmtAgo(conv.lastAt)}</div>
      </div>
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

function Bubble({ message }: { message: WaMessage }) {
  if (message.actor === "system") {
    return (
      <div className="sys">
        <span className="l" />
        {message.body || "—"}
        <span className="l" />
      </div>
    );
  }
  const variant = message.actor === "operator" ? "out" : message.actor === "bot" ? "bot" : "in";
  const kind = kindLabel(message);
  return (
    <div className={`bub ${variant}`}>
      <div className="meta">
        <span className="who" style={variant === "bot" ? { color: "var(--info)" } : undefined}>
          {actorLabel(message)}
        </span>
        {kind && <span className="kind">{kind}</span>}
      </div>
      {message.body || "(empty)"}
      <div className="t" title={fmtFull(message.at)}>
        {fmtAgo(message.at)}
      </div>
    </div>
  );
}

function Check({ label, done }: { label: string; done: boolean }) {
  return (
    <div className={`check${done ? " done" : ""}`}>
      <span className="b">{done ? "✓" : ""}</span>
      {label}
    </div>
  );
}
