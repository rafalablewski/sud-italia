"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  MessageCircle,
  MessageSquare,
  RotateCw,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileWhatsApp = dynamic(
  () => import("./mobile/MobileWhatsApp").then((m) => m.MobileWhatsApp),
  { ssr: false },
);
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Select,
  Table,
  Tabs,
  Textarea,
  type Column,
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

// ---- helpers ------------------------------------------------------------

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso || "—";
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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
  const [tab, setTab] = useState<"conversations" | "settings">("conversations");
  const [settings, setSettings] = useState<WaSettings | null>(null);
  const [sessions, setSessions] = useState<WaSessionRow[]>([]);
  const [heads, setHeads] = useState<TranscriptHead[]>([]);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [welcomeDraft, setWelcomeDraft] = useState("");
  const [optOutDraft, setOptOutDraft] = useState("");
  const [reopenDraft, setReopenDraft] = useState("");
  const [capDraft, setCapDraft] = useState("60");
  const [loading, setLoading] = useState(true);
  const [openPhone, setOpenPhone] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const conversations = useMemo(
    () => mergeConversations(sessions, heads),
    [sessions, heads],
  );

  const patch = useCallback(
    async (updates: Partial<WaSettings>) => {
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const next = (await res.json()) as WaSettings;
        setSettings(next);
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
    if (ok) toast.success("WhatsApp settings saved");
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

  const conversationCols = useMemo<Column<ConversationRow>[]>(
    () => [
      {
        key: "phone",
        header: "Phone",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs admin-text">{row.phone}</span>
            {row.hasActiveSession && <Badge tone="success">live</Badge>}
          </div>
        ),
      },
      {
        key: "customer",
        header: "Customer",
        cell: (row) => row.customerName || <span className="admin-text-secondary">—</span>,
      },
      {
        key: "location",
        header: "Location",
        cell: (row) =>
          row.locationSlug ? (
            <Badge tone="info">{row.locationSlug}</Badge>
          ) : (
            <span className="admin-text-secondary">—</span>
          ),
      },
      {
        key: "cart",
        header: "Cart",
        cell: (row) =>
          row.cartCount > 0 ? (
            <span>
              {row.cartCount} item(s) · {formatPrice(row.cartSubtotalGrosze)}
            </span>
          ) : (
            <span className="admin-text-secondary">—</span>
          ),
      },
      {
        key: "pending",
        header: "Pending order",
        cell: (row) =>
          row.pendingOrderId ? (
            <span className="font-mono text-xs">{row.pendingOrderId}</span>
          ) : (
            <span className="admin-text-secondary">—</span>
          ),
      },
      {
        key: "messages",
        header: "Messages",
        cell: (row) => <span className="text-xs">{row.messageCount || "—"}</span>,
      },
      {
        key: "lastAt",
        header: "Last activity",
        cell: (row) => <span className="text-xs" title={fmtFull(row.lastAt)}>{fmtAgo(row.lastAt)}</span>,
        sortValue: (row) => row.lastAt,
      },
      {
        key: "actions",
        header: "",
        cell: (row) => (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenPhone(row.phone)}
              leadingIcon={<MessageCircle className="h-3.5 w-3.5" />}
            >
              Open
            </Button>
            {row.hasActiveSession && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resetSession(row.phone)}
                title="Reset session"
                leadingIcon={<RotateCw className="h-3.5 w-3.5" />}
              >
                Reset
              </Button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const m7 = metrics?.windows.last7d;
  const m30 = metrics?.windows.last30d;
  const mLife = metrics?.windows.lifetime;
  const af = metrics?.activeSessions;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">WhatsApp ordering</h1>
          <p className="v2-page-subtitle">
            Customers message the WhatsApp Business number; the bot walks them through the order and sends a Stripe Pay link in chat.
          </p>
        </div>
        <Button
          onClick={loadAll}
          variant="ghost"
          size="sm"
          leadingIcon={<RotateCw className="h-4 w-4" />}
        >
          Refresh
        </Button>
      </header>

      {/* Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h2 className="admin-text font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Channel metrics
            </h2>
            <span className="text-xs admin-text-secondary">
              {metrics ? `Updated ${fmtAgo(metrics.generatedAt)}` : "—"}
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile
              icon={<CircleDollarSign className="h-4 w-4" />}
              label="Orders · 7d"
              value={m7 ? `${m7.orders.paid}` : "—"}
              hint={m7 ? `${formatPrice(m7.orders.revenueGrosze)} revenue · ${m7.orders.cancelled} cancelled` : ""}
            />
            <MetricTile
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Conversion · 7d"
              value={m7 ? pct(m7.conversionRate) : "—"}
              hint={m7 ? `${m7.activity.uniquePhones} unique phones` : ""}
            />
            <MetricTile
              icon={<Users className="h-4 w-4" />}
              label="Active sessions"
              value={af ? `${af.totalSessions}` : "—"}
              hint={af ? `${af.awaitingPayment} awaiting payment` : ""}
            />
            <MetricTile
              icon={<MessageSquare className="h-4 w-4" />}
              label="Orders · lifetime"
              value={mLife ? `${mLife.orders.paid}` : "—"}
              hint={mLife ? `${formatPrice(mLife.orders.revenueGrosze)} · avg ${formatPrice(mLife.orders.averageGrosze)}` : ""}
            />
          </div>
          {af && af.totalSessions > 0 && (
            <div className="mt-4">
              <div className="text-xs admin-text-secondary mb-1">
                Active funnel (current sessions)
              </div>
              <FunnelBar
                stages={[
                  { label: "Location set", value: af.locationSet },
                  { label: "Has cart", value: af.cartHasItems },
                  { label: "Fulfillment", value: af.fulfillmentSet },
                  { label: "Slot picked", value: af.slotPicked },
                  { label: "Awaiting pay", value: af.awaitingPayment },
                ]}
                total={af.totalSessions}
              />
            </div>
          )}
          {m30 && (
            <div className="mt-3 text-xs admin-text-secondary">
              30-day rollup: {m30.orders.paid} paid · {m30.orders.cancelled} cancelled · {formatPrice(m30.orders.revenueGrosze)} revenue
            </div>
          )}
        </CardBody>
      </Card>

      <Tabs<"conversations" | "settings">
        tabs={[
          { value: "conversations", label: "Conversations" },
          { value: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={(v) => setTab(v)}
      />

      {tab === "conversations" && (
        <Card>
          <CardHeader>
            <h2 className="admin-text font-semibold">Conversations</h2>
            <p className="admin-text-secondary text-xs">
              Active sessions (within 90 min) plus historic transcripts. Open one to see the full chat and reply.
            </p>
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="admin-text-secondary text-sm">Loading…</p>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations yet"
                description="When a customer messages the WhatsApp number they appear here, with the full chat history."
              />
            ) : (
              <Table
                columns={conversationCols}
                rows={conversations}
                rowKey={(r) => r.phone}
                density="compact"
                defaultSort={{ key: "lastAt", dir: "desc" }}
              />
            )}
          </CardBody>
        </Card>
      )}

      {tab === "settings" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <h2 className="admin-text font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Channel
              </h2>
              <Button
                size="sm"
                variant={settings?.enabled ? "danger" : "primary"}
                onClick={toggleEnabled}
                disabled={!settings}
              >
                {settings?.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
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
                Used by the Send Template action in Conversations when the customer is outside the 24-hour messaging window.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveTextSettings} size="sm">
                Save text settings
              </Button>
            </div>
            {!settings?.enabled && (
              <div className="text-xs admin-text-secondary flex items-center gap-2">
                <ShieldAlert className="h-3 w-3" /> The webhook still verifies signatures while disabled; the bot just replies that ordering is off.
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <ConversationDialog
        phone={openPhone}
        templateName={settings?.reopenTemplate ?? ""}
        onClose={() => {
          setOpenPhone(null);
          // Reload the heads after closing so any operator message we sent
          // refreshes the row's last-activity stamp.
          loadAll();
        }}
      />
    </div>
  );
}

// ---- subcomponents ------------------------------------------------------

function MetricTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-2 admin-text-secondary text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="admin-text font-semibold text-lg mt-1">{value}</div>
      {hint && <div className="admin-text-secondary text-xs mt-0.5">{hint}</div>}
    </div>
  );
}

function FunnelBar({ stages, total }: { stages: { label: string; value: number }[]; total: number }) {
  if (total === 0) return null;
  return (
    <div className="space-y-1">
      {stages.map((s) => {
        const w = Math.max(0, Math.min(100, Math.round((s.value / total) * 100)));
        return (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="admin-text-secondary w-28 shrink-0">{s.label}</span>
            <div className="flex-1 h-2 rounded bg-[var(--surface-2)] overflow-hidden">
              <div className="h-full bg-[var(--success-soft)]" style={{ width: `${w}%` }} />
            </div>
            <span className="admin-text w-12 text-right tabular-nums">
              {s.value}
              <span className="admin-text-secondary"> / {total}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConversationDialog({
  phone,
  templateName,
  onClose,
}: {
  phone: string | null;
  templateName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/transcripts/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: WaMessage[] };
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } else {
        setMessages([]);
      }
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    if (phone) {
      setReply("");
      load();
    } else {
      setMessages([]);
    }
  }, [phone, load]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    if (!phone || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/sessions/${encodeURIComponent(phone)}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: reply }),
        },
      );
      if (res.ok) {
        toast.success("Message sent");
        setReply("");
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not send", data?.error || "Customer may be outside the 24h window.");
      }
    } finally {
      setSending(false);
    }
  };

  const sendTemplate = async () => {
    if (!phone) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/sessions/${encodeURIComponent(phone)}/template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        toast.success(`Template "${templateName}" sent`);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not send template", data?.error || "Check the configured template name.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={!!phone}
      onClose={onClose}
      title={phone ? `Conversation · ${phone}` : ""}
      size="lg"
    >
      <div className="space-y-3">
        <div
          ref={transcriptRef}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 max-h-[420px] overflow-y-auto space-y-2"
        >
          {loading ? (
            <p className="admin-text-secondary text-sm">Loading transcript…</p>
          ) : messages.length === 0 ? (
            <p className="admin-text-secondary text-sm">No messages yet.</p>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} />)
          )}
        </div>
        <div>
          <label className="admin-text text-xs uppercase tracking-wide block mb-1">
            Reply as operator (only works inside the 24h messaging window)
          </label>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={1024}
            placeholder="Type your reply…"
          />
          <div className="flex justify-between items-center mt-2 gap-2 flex-wrap">
            <div className="text-xs admin-text-secondary">
              {templateName ? (
                <>
                  Outside the 24h window? Send the approved template{" "}
                  <code className="font-mono">{templateName}</code>.
                </>
              ) : (
                "No re-open template configured. Set one in Settings to recover lapsed conversations."
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={sendTemplate}
                disabled={!templateName || sending}
                variant="secondary"
                size="sm"
                leadingIcon={<ArrowDown className="h-3.5 w-3.5" />}
              >
                Send template
              </Button>
              <Button
                onClick={send}
                disabled={!reply.trim() || sending}
                size="sm"
                leadingIcon={<Send className="h-3.5 w-3.5" />}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function MessageBubble({ message }: { message: WaMessage }) {
  const isOutbound = message.direction === "out";
  const actorLabel = message.actor === "customer"
    ? "Customer"
    : message.actor === "operator"
      ? "You"
      : message.actor === "system"
        ? "System"
        : "Bot";
  const tone =
    message.actor === "operator"
      ? "bg-[var(--success-soft)] border-[color-mix(in_oklab,var(--success)_35%,transparent)]"
      : isOutbound
        ? "bg-[var(--info-soft)] border-[color-mix(in_oklab,var(--info)_35%,transparent)]"
        : "bg-[var(--surface-3)] border-[var(--border-strong)]";
  const kindLabel =
    message.kind === "cta_url"
      ? `(CTA → ${typeof message.meta?.url === "string" ? message.meta.url : "link"})`
      : message.kind === "template"
        ? `(template: ${typeof message.meta?.templateName === "string" ? message.meta.templateName : "?"})`
        : message.kind === "list"
          ? "(interactive list)"
          : message.kind === "buttons"
            ? "(buttons)"
            : message.kind === "selection"
              ? "(tap)"
              : message.kind === "location"
                ? "(location)"
                : message.kind === "unsupported"
                  ? "(unsupported)"
                  : "";

  return (
    <div
      className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[80%] rounded-lg border px-3 py-2 ${tone}`}>
        <div className="flex items-center gap-2 text-[10px] admin-text-secondary uppercase tracking-wide mb-1">
          <span>{actorLabel}</span>
          {kindLabel && <span>{kindLabel}</span>}
          <span className="ml-auto" title={fmtFull(message.at)}>
            {fmtAgo(message.at)}
          </span>
        </div>
        <div className="admin-text whitespace-pre-wrap text-sm break-words">
          {message.body || <span className="admin-text-secondary italic">(empty)</span>}
        </div>
      </div>
    </div>
  );
}
