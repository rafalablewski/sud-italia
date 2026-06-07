"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, type ColumnV3, SkeletonRows, Table } from "./ui";

type Status = "pending" | "active" | "paused" | "cancelled";
interface Intent {
  id: string;
  customerPhone: string;
  locationSlug: string;
  bundleName: string;
  weekday: string;
  readyAt: string;
  cartSnapshot: { menuItemId: string; quantity: number }[];
  status: Status;
  updatedAt: string;
}

const STATUS_LABEL: Record<Status, string> = { pending: "Pending", active: "Active", paused: "Paused", cancelled: "Cancelled" };
const STATUS_TONE: Record<Status, BadgeTone> = { pending: "warn", active: "ok", paused: "info", cancelled: "neutral" };
const WEEKDAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function ScheduledBundlesV3() {
  const { location } = useAdminLocationV3();
  const [list, setList] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = location ? `?location=${location}` : "";
    const res = await fetch(`/api/admin/scheduled-bundles${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setList(Array.isArray(res) ? res : Array.isArray(res?.intents) ? res.intents : []);
    setLoading(false);
  }, [location]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, status: Status) => {
    setBusy(id);
    setList((arr) => arr.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await fetch(`/api/admin/scheduled-bundles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length, pending: 0, active: 0, paused: 0, cancelled: 0 };
    for (const i of list) c[i.status]++;
    return c;
  }, [list]);
  // Sort by weekday → readyAt so the operator's fulfilment checklist mirrors
  // how the day actually runs (v2 parity).
  const rows = useMemo(() => {
    const filtered = filter === "all" ? list : list.filter((i) => i.status === filter);
    return [...filtered].sort((a, b) => {
      const ai = WEEKDAY_ORDER.indexOf(a.weekday.toLowerCase());
      const bi = WEEKDAY_ORDER.indexOf(b.weekday.toLowerCase());
      if (ai !== bi) return ai - bi;
      return a.readyAt.localeCompare(b.readyAt);
    });
  }, [list, filter]);
  const chips: ("all" | Status)[] = ["all", "pending", "active", "paused", "cancelled"];

  const cols: ColumnV3<Intent>[] = [
    { key: "bundle", header: "Bundle", render: (i) => <span style={{ fontWeight: 600 }}>{i.bundleName}</span> },
    { key: "phone", header: "Customer", render: (i) => <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)" }}>{i.customerPhone}</span> },
    { key: "when", header: "Cadence", render: (i) => <span className="av3-cell-muted" style={{ textTransform: "capitalize" }}>{i.weekday} · {i.readyAt}</span> },
    { key: "items", header: "Items", num: true, render: (i) => `${i.cartSnapshot.reduce((s, c) => s + c.quantity, 0)}` },
    { key: "st", header: "Status", render: (i) => <Badge tone={STATUS_TONE[i.status]} dot>{STATUS_LABEL[i.status]}</Badge> },
    { key: "act", header: "", render: (i) => (
      <span style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {i.status === "pending" && <Button variant="primary" size="sm" loading={busy === i.id} onClick={() => patch(i.id, "active")}>Approve</Button>}
        {i.status === "active" && <Button variant="ghost" size="sm" loading={busy === i.id} onClick={() => patch(i.id, "paused")}>Pause</Button>}
        {i.status === "paused" && <Button variant="secondary" size="sm" loading={busy === i.id} onClick={() => patch(i.id, "active")}>Resume</Button>}
        {i.status !== "cancelled" && <Button variant="danger" size="sm" loading={busy === i.id} onClick={() => patch(i.id, "cancelled")}>Cancel</Button>}
      </span>
    ) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Scheduled bundles</h1>
          <div className="av3-pagehead-sub">Standing weekly pre-orders customers set up · approve &amp; manage</div>
        </div>
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : STATUS_LABEL[f]}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading && list.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No scheduled bundles</div><div className="av3-empty-text">Recurring pre-orders customers set up land here for approval.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(i) => i.id} />
          )}
        </div>
      )}
    </>
  );
}
