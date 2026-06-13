"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, PauseCircle, Repeat } from "lucide-react";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, InfoButton, Kpi, SkeletonKpiRail, SkeletonRows, Table } from "./ui";

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

/** Humanise a menu item id ("krk-pizza-margherita" → "Pizza margherita"). */
const itemLabel = (id: string) => {
  const s = id.replace(/^[^-]+-/, "").replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
};
const unitsOf = (i: Intent) => (i.cartSnapshot ?? []).reduce((s, c) => s + c.quantity, 0);

export function ScheduledBundlesV3() {
  const { location } = useAdminLocationV3();
  const [list, setList] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

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
  // Standing weekly demand = units across the orders that are actually live.
  const weeklyUnits = useMemo(() => list.filter((i) => i.status === "active").reduce((s, i) => s + unitsOf(i), 0), [list]);
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
  const detail = detailId ? list.find((i) => i.id === detailId) ?? null : null;

  const cols: ColumnV3<Intent>[] = [
    { key: "bundle", header: "Bundle", render: (i) => <span style={{ fontWeight: 600 }}>{i.bundleName}</span> },
    { key: "phone", header: "Customer", render: (i) => <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)" }}>{i.customerPhone}</span> },
    { key: "when", header: "Cadence", render: (i) => <span className="av3-cell-muted" style={{ textTransform: "capitalize" }}>{i.weekday} · {i.readyAt}</span> },
    { key: "items", header: "Items", num: true, render: (i) => `${unitsOf(i)}` },
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

      {loading && list.length === 0 ? <SkeletonKpiRail count={4} /> : (
      <div className="av3-kpi-rail">
        <Kpi label="Pending approval" icon={CalendarClock} value={`${counts.pending}`} accentVar="--av3-c5"
          info={<InfoButton title="Pending approval" description="Standing weekly pre-orders a customer has set up that are waiting for you to approve before they go live."
            institutional="This is the only blocking step in the standing-order funnel — a customer has committed to a recurring order, and every day it sits unapproved is a week of guaranteed revenue not locked in. The operator gate: clear this to zero each shift; a growing backlog is leaked recurring demand, not a queue you can sit on."
            plain="Three people asked to get the same family box every Friday. Until you tap Approve, none of them are on the prep list — approve them and that's three baskets you can bank every week without selling again."
            tips="Approve from the row action or open the order to check the cart first; if a request looks wrong (odd cadence, off-menu items) cancel it with a note rather than leaving it pending; keep this tile at zero by the end of each shift."
            methodology="Counts intents with status === 'pending' from /api/admin/scheduled-bundles for the current location scope. Approving sets status → active (PATCH /api/admin/scheduled-bundles/:id)." />} />
        <Kpi label="Active" icon={CheckCircle2} value={`${counts.active}`} accentVar="--av3-c4" />
        <Kpi label="Weekly units" icon={Repeat} value={`${weeklyUnits}`} accentVar="--av3-c3"
          info={<InfoButton title="Standing weekly units" description="Total item count across all active standing orders — the guaranteed recurring demand you'll prep every week."
            institutional="Recurring revenue is the most valuable kind: it's forecastable, it smooths the prep line, and it carries near-zero reacquisition cost. This number is your committed weekly baseline before a single walk-in. The CFO read: rising weekly units means the bundle programme is building an annuity, not just one-off discounts."
            plain="If ten active orders each carry four items, that's 40 portions you know you're making every week — you can buy ingredients and roster the line against it instead of guessing."
            tips="Grow it by approving pending orders promptly and by pitching the 'save it as a weekly' option at checkout; watch for paused orders creeping up (lost annuity) and win them back; use the cadence sort to batch same-day pickups."
            methodology="Sum of cartSnapshot quantities over intents with status === 'active'. Recomputed from the live list; paused/cancelled orders are excluded." />} />
        <Kpi label="Paused" icon={PauseCircle} value={`${counts.paused}`} accentVar="--av3-c2" />
      </div>
      )}

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
            <Table columns={cols} rows={rows} rowKey={(i) => i.id} onRowClick={(i) => setDetailId(i.id)} />
          )}
        </div>
      )}

      {detail && (
        <Dialog open onClose={() => setDetailId(null)} title={detail.bundleName} subtitle={`${detail.customerPhone} · standing pre-order`}
          headerExtra={<Badge tone={STATUS_TONE[detail.status]} dot>{STATUS_LABEL[detail.status]}</Badge>} width={520}
          footer={
            <span style={{ display: "inline-flex", gap: 6 }}>
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>Close</Button>
              {detail.status === "pending" && <Button variant="primary" size="sm" loading={busy === detail.id} onClick={() => patch(detail.id, "active")}>Approve</Button>}
              {detail.status === "active" && <Button variant="ghost" size="sm" loading={busy === detail.id} onClick={() => patch(detail.id, "paused")}>Pause</Button>}
              {detail.status === "paused" && <Button variant="secondary" size="sm" loading={busy === detail.id} onClick={() => patch(detail.id, "active")}>Resume</Button>}
              {detail.status !== "cancelled" && <Button variant="danger" size="sm" loading={busy === detail.id} onClick={() => patch(detail.id, "cancelled")}>Cancel</Button>}
            </span>
          }>
          <div className="av3-od-grid" style={{ marginBottom: 14 }}>
            <div className="av3-od-field"><div className="k">Cadence</div><div className="v" style={{ textTransform: "capitalize" }}>{detail.weekday}</div></div>
            <div className="av3-od-field"><div className="k">Ready at</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{detail.readyAt}</div></div>
            <div className="av3-od-field"><div className="k">Units</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{unitsOf(detail)}</div></div>
            <div className="av3-od-field"><div className="k">Updated</div><div className="v" style={{ fontSize: 12 }}>{new Date(detail.updatedAt).toLocaleDateString("pl-PL")}</div></div>
          </div>
          <div className="av3-field-label" style={{ marginBottom: 6 }}>Standing cart</div>
          <div style={{ border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", overflow: "hidden" }}>
            {!detail.cartSnapshot || detail.cartSnapshot.length === 0 ? (
              <div className="av3-cell-muted" style={{ fontSize: 12, padding: "10px 12px" }}>No items recorded on this order.</div>
            ) : detail.cartSnapshot.map((c, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 12px", fontSize: 12.5, borderBottom: idx === detail.cartSnapshot!.length - 1 ? "none" : "1px solid var(--av3-line)" }}>
                <span>{itemLabel(c.menuItemId)}</span>
                <span className="mono" style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-platinum)" }}>×{c.quantity}</span>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
