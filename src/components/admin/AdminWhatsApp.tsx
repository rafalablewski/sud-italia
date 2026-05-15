"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RotateCw, ShieldAlert } from "lucide-react";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";
import { formatPrice } from "@/lib/utils";

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

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AdminWhatsApp() {
  const toast = useToast();
  const [settings, setSettings] = useState<WaSettings | null>(null);
  const [sessions, setSessions] = useState<WaSessionRow[]>([]);
  const [welcomeDraft, setWelcomeDraft] = useState("");
  const [optOutDraft, setOptOutDraft] = useState("");
  const [reopenDraft, setReopenDraft] = useState("");
  const [capDraft, setCapDraft] = useState("60");
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/admin/whatsapp/settings"),
        fetch("/api/admin/whatsapp/sessions"),
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  const cols = useMemo<Column<WaSessionRow>[]>(
    () => [
      {
        key: "phone",
        header: "Phone",
        cell: (row) => (
          <span className="font-mono text-xs admin-text">{row.phone}</span>
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
            <span className="admin-text-secondary">empty</span>
          ),
      },
      {
        key: "fulfillment",
        header: "Type",
        cell: (row) =>
          row.fulfillmentType ? <Badge tone="warning">{row.fulfillmentType}</Badge> : "—",
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
        key: "lastTurnAt",
        header: "Last activity",
        cell: (row) => <span className="text-xs">{fmtAgo(row.lastTurnAt)}</span>,
      },
      {
        key: "actions",
        header: "",
        cell: (row) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resetSession(row.phone)}
            title="Reset session"
            leadingIcon={<RotateCw className="h-3.5 w-3.5" />}
          >
            Reset
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
              Approved Meta template for re-opening the 24h window (optional)
            </label>
            <Input
              value={reopenDraft}
              onChange={(e) => setReopenDraft(e.target.value)}
              placeholder="sud_italia_order_update"
            />
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

      <Card>
        <CardHeader>
          <h2 className="admin-text font-semibold">Active conversations</h2>
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="admin-text-secondary text-sm">Loading…</p>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No active sessions"
              description="Sessions appear here as customers message the WhatsApp number. They expire after 90 minutes of inactivity."
            />
          ) : (
            <Table columns={cols} rows={sessions} rowKey={(r) => r.phone} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
