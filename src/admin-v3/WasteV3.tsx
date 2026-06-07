"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Kpi, Table, type ColumnV3 } from "./ui";

interface WasteEntry {
  id: string;
  locationSlug: string;
  item: string;
  quantity: number;
  unit: string;
  reason: string;
  estimatedCostGrosze?: number;
  recordedAt: string;
}

const REASONS: { value: string; label: string }[] = [
  { value: "spoilage", label: "Spoilage" },
  { value: "prep_error", label: "Prep error" },
  { value: "dropped", label: "Dropped / damaged" },
  { value: "overproduction", label: "Over-production" },
  { value: "customer_return", label: "Customer return" },
  { value: "expired", label: "Expired" },
  { value: "other", label: "Other" },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function WasteV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [logs, setLogs] = useState<WasteEntry[]>([]);
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [reason, setReason] = useState("spoilage");
  const [costStr, setCostStr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ location: loc, from: startOfTodayIso() });
    const res = await fetch(`/api/admin/waste?${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(res) ? res : []);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const qtyNum = parseFloat(quantity);
  const canSubmit = item.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0;

  const record = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const costGrosze = costStr.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(costStr) * 100));
      const res = await fetch("/api/admin/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: loc, item: item.trim(), quantity: qtyNum, unit: unit.trim(), reason, estimatedCostGrosze: Number.isFinite(costGrosze as number) ? costGrosze : undefined }),
      });
      if (res.ok) { setItem(""); setQuantity(""); setCostStr(""); await load(); }
    } finally {
      setSaving(false);
    }
  };

  const costToday = logs.reduce((s, l) => s + (l.estimatedCostGrosze ?? 0), 0);
  const cols: ColumnV3<WasteEntry>[] = [
    { key: "t", header: "Time", render: (l) => <span className="av3-cell-muted">{fmtTime(l.recordedAt)}</span> },
    { key: "i", header: "Item", render: (l) => <span style={{ fontWeight: 500 }}>{l.item}</span> },
    { key: "q", header: "Qty", num: true, render: (l) => `${l.quantity} ${l.unit}` },
    { key: "r", header: "Reason", render: (l) => <Badge tone="neutral">{REASON_LABEL[l.reason] ?? l.reason}</Badge> },
    { key: "c", header: "Cost", num: true, render: (l) => (l.estimatedCostGrosze ? formatPrice(l.estimatedCostGrosze) : <span className="av3-cell-muted">—</span>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Waste log</h1>
          <div className="av3-pagehead-sub">Reason-coded write-offs · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Entries today" icon={Trash2} value={`${logs.length}`} accentVar="--av3-c5" />
        <Kpi label="Write-off today" icon={Trash2} value={formatPrice(costToday)} accentVar="--av3-c1" />
      </div>

      <Card>
        <CardHead title="Log waste" />
        <CardBody>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ flex: 1, minWidth: 180 }}><span className="av3-field-label">Item</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. mozzarella" /></label>
            <label className="av3-field" style={{ width: 90 }}><span className="av3-field-label">Qty</span><input className="av3-input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
            <label className="av3-field" style={{ width: 80 }}><span className="av3-field-label">Unit</span><input className="av3-input" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Reason</span>
              <select className="av3-select" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            </label>
            <label className="av3-field" style={{ width: 100 }}><span className="av3-field-label">Cost (zł)</span><input className="av3-input" type="number" step="0.01" value={costStr} onChange={(e) => setCostStr(e.target.value)} placeholder="opt." /></label>
            <Button variant="primary" size="sm" loading={saving} disabled={!canSubmit} onClick={record}>Log waste</Button>
          </div>
        </CardBody>
      </Card>

      <Card style={{ padding: 0 }}>
        {logs.length === 0 ? (
          <div className="av3-empty"><div className="av3-empty-title">No waste today</div><div className="av3-empty-text">Log a write-off above when something’s discarded.</div></div>
        ) : (
          <Table columns={cols} rows={logs} rowKey={(l) => l.id} />
        )}
      </Card>
    </>
  );
}
