"use client";

import { useEffect, useState } from "react";
import { Calendar, Pause, Play, X, Loader2, AlertCircle } from "lucide-react";
import { LocationFilter, Tabs } from "./v2/ui";

type Status = "pending" | "active" | "paused" | "cancelled";

interface ScheduledBundleIntent {
  id: string;
  customerPhone: string;
  locationSlug: string;
  bundleId: string;
  bundleName: string;
  weekday: string;
  readyAt: string;
  cartSnapshot: { menuItemId: string; quantity: number }[];
  status: Status;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TABS: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

const WEEKDAY_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

export function AdminScheduledBundles() {
  const [activeLocation, setActiveLocation] = useState<string>("krakow");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("pending");
  const [intents, setIntents] = useState<ScheduledBundleIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (activeLocation) qs.set("location", activeLocation);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    fetch(`/api/admin/scheduled-bundles?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: { intents: ScheduledBundleIntent[] }) => {
        setIntents(d.intents);
        setLoading(false);
      })
      .catch((e) => {
        setErr(typeof e === "string" ? e : "Failed to load intents");
        setLoading(false);
      });
  };

  useEffect(refresh, [activeLocation, statusFilter]);

  const patch = async (id: string, status: Status) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/scheduled-bundles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  // Sort by weekday ↑ then readyAt ↑ so the operator's manual fulfilment
  // checklist mirrors how the day actually runs.
  const sorted = [...intents].sort((a, b) => {
    const ai = WEEKDAY_ORDER.indexOf(a.weekday as typeof WEEKDAY_ORDER[number]);
    const bi = WEEKDAY_ORDER.indexOf(b.weekday as typeof WEEKDAY_ORDER[number]);
    if (ai !== bi) return ai - bi;
    return a.readyAt.localeCompare(b.readyAt);
  });

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Scheduled bundles</h1>
          <p className="v2-page-subtitle">
            Pret-style &ldquo;weekly usual&rdquo; intents customers opted into after applying a bundle. Phase-1
            captures + lets the operator approve / pause / cancel; Phase-2 wires Stripe Subscriptions for
            actual recurring billing.
          </p>
        </div>
      </header>

      <LocationFilter variant="tabs" value={activeLocation} onChange={setActiveLocation} />

      <Tabs
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as "all" | Status)}
        tabs={STATUS_TABS}
        variant="underline"
        ariaLabel="Status filter"
      />

      {err && (
        <div className="glass-card p-4 text-sm text-[var(--danger)] flex items-center gap-2 mt-3">
          <AlertCircle className="h-4 w-4" />
          {err}
          <button onClick={() => setErr(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="v2-page-loading">Loading Scheduled bundles…</div>
      ) : sorted.length === 0 ? (
        <div className="glass-card p-8 text-center mt-3">
          <Calendar className="h-8 w-8 text-[var(--warning)] mx-auto mb-2" />
          <p className="text-sm admin-text">No {statusFilter === "all" ? "" : statusFilter + " "}intents.</p>
          <p className="text-xs admin-text-secondary mt-1">
            Customers opt in via the cart drawer when a bundle is applied.
          </p>
        </div>
      ) : (
        <div className="glass-card p-4 mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left admin-text-secondary text-xs uppercase tracking-wide">
                  <th className="py-2 pr-3">Weekday · time</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Bundle</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-3 admin-text">
                      <span className="capitalize">{s.weekday}</span>
                      <span className="text-[var(--warning)] ml-1">· {s.readyAt}</span>
                    </td>
                    <td className="py-2 pr-3 admin-text font-mono text-xs">{s.customerPhone}</td>
                    <td className="py-2 pr-3 admin-text">{s.bundleName}</td>
                    <td className="py-2 pr-3 admin-text-secondary text-xs">
                      {s.cartSnapshot.reduce((sum, c) => sum + c.quantity, 0)} item
                      {s.cartSnapshot.reduce((sum, c) => sum + c.quantity, 0) === 1 ? "" : "s"}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="inline-flex gap-1">
                        {s.status === "pending" && (
                          <ActionBtn
                            onClick={() => patch(s.id, "active")}
                            busy={busy === s.id}
                            tone="primary"
                            label="Approve"
                            icon={Play}
                          />
                        )}
                        {s.status === "active" && (
                          <ActionBtn
                            onClick={() => patch(s.id, "paused")}
                            busy={busy === s.id}
                            tone="amber"
                            label="Pause"
                            icon={Pause}
                          />
                        )}
                        {s.status === "paused" && (
                          <ActionBtn
                            onClick={() => patch(s.id, "active")}
                            busy={busy === s.id}
                            tone="primary"
                            label="Resume"
                            icon={Play}
                          />
                        )}
                        {s.status !== "cancelled" && (
                          <ActionBtn
                            onClick={() => patch(s.id, "cancelled")}
                            busy={busy === s.id}
                            tone="danger"
                            label="Cancel"
                            icon={X}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const cls =
    status === "active"
      ? "bg-[var(--success-soft)] text-[var(--success)] border-[color-mix(in_oklab,var(--success)_30%,transparent)]"
      : status === "pending"
        ? "bg-[var(--warning-soft)] text-[var(--warning)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]"
        : status === "paused"
          ? "bg-[var(--surface-3)] text-[var(--fg-muted)] border-[var(--border-strong)]"
          : "bg-[var(--danger-soft)] text-[var(--danger)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {status}
    </span>
  );
}

function ActionBtn({
  onClick,
  busy,
  tone,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  busy: boolean;
  tone: "primary" | "amber" | "danger";
  label: string;
  icon: typeof Pause;
}) {
  const cls =
    tone === "primary"
      ? "bg-[var(--success-soft)] text-[var(--success)] hover:bg-[color-mix(in_oklab,var(--success)_22%,transparent)]"
      : tone === "amber"
        ? "bg-[var(--warning-soft)] text-[var(--warning)] hover:bg-[color-mix(in_oklab,var(--warning)_22%,transparent)]"
        : "bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}
