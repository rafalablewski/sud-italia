"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Clock, Scale } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface Handover {
  id: string;
  locationSlug: string;
  shift: string;
  cashCountedGrosze?: number;
  cashVarianceGrosze?: number;
  tempChecksOk: boolean;
  wasteNoted: boolean;
  equipmentOk: boolean;
  managerComment?: string;
  outgoingManager: string;
  incomingManager?: string;
  recordedAt: string;
}

const SHIFTS = [
  { value: "open", label: "Opening" },
  { value: "mid", label: "Mid-shift" },
  { value: "close", label: "Closing" },
];
const SHIFT_LABEL: Record<string, string> = { open: "Opening", mid: "Mid-shift", close: "Closing" };

function startOfWeekIso() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}
function varianceTone(g: number): BadgeTone {
  const abs = Math.abs(g);
  if (abs < 200) return "ok";
  if (abs < 1000) return "warn";
  return "bad";
}
function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function HandoverV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [logs, setLogs] = useState<Handover[]>([]);
  const [shift, setShift] = useState("close");
  const [cashStr, setCashStr] = useState("");
  const [tempOk, setTempOk] = useState(true);
  const [wasteNoted, setWasteNoted] = useState(true);
  const [equipOk, setEquipOk] = useState(true);
  const [outgoing, setOutgoing] = useState("");
  const [incoming, setIncoming] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/handover?location=${encodeURIComponent(loc)}&from=${encodeURIComponent(startOfWeekIso())}`)
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(res) ? res : []);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const issues = logs.filter((h) => !h.tempChecksOk || !h.wasteNoted || !h.equipmentOk).length;
    const netVar = logs.reduce((s, h) => s + (typeof h.cashVarianceGrosze === "number" ? h.cashVarianceGrosze : 0), 0);
    const last = logs.length ? [...logs].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0].recordedAt : null;
    return { week: logs.length, issues, netVar, last };
  }, [logs]);

  const canSubmit = outgoing.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const counted = cashStr.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(cashStr) * 100));
      const res = await fetch("/api/admin/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug: loc, shift,
          cashCountedGrosze: Number.isFinite(counted as number) ? counted : undefined,
          tempChecksOk: tempOk, wasteNoted, equipmentOk: equipOk,
          outgoingManager: outgoing.trim(),
          incomingManager: incoming.trim() || undefined,
          managerComment: comment.trim() || undefined,
        }),
      });
      if (res.ok) { setCashStr(""); setComment(""); setIncoming(""); await load(); }
    } finally {
      setSaving(false);
    }
  };

  const cols: ColumnV3<Handover>[] = [
    { key: "t", header: "When", render: (h) => <span className="av3-cell-muted">{fmtWhen(h.recordedAt)}</span> },
    { key: "s", header: "Shift", render: (h) => <Badge tone="info">{SHIFT_LABEL[h.shift] ?? h.shift}</Badge> },
    { key: "mgr", header: "Outgoing", render: (h) => h.outgoingManager },
    { key: "checks", header: "Checks", render: (h) => (
      <span style={{ display: "inline-flex", gap: 4 }}>
        <Badge tone={h.tempChecksOk ? "ok" : "bad"}>Temp</Badge>
        <Badge tone={h.equipmentOk ? "ok" : "bad"}>Equip</Badge>
      </span>
    ) },
    { key: "var", header: "Cash variance", num: true, render: (h) => (typeof h.cashVarianceGrosze === "number" ? <Badge tone={varianceTone(h.cashVarianceGrosze)}>{h.cashVarianceGrosze >= 0 ? "+" : ""}{formatPrice(h.cashVarianceGrosze)}</Badge> : <span className="av3-cell-muted">—</span>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Shift handover</h1>
          <div className="av3-pagehead-sub">End-of-shift sign-off · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="This week" icon={ClipboardCheck} value={`${stats.week}`} accentVar="--av3-c3" />
        <Kpi label="Issues flagged" icon={AlertTriangle} value={`${stats.issues}`} accentVar="--av3-c1" />
        <Kpi label="Net cash variance" icon={Scale} value={`${stats.netVar >= 0 ? "+" : ""}${formatPrice(stats.netVar)}`} accentVar="--av3-c2" />
        <Kpi label="Last sign-off" icon={Clock} value={stats.last ? fmtWhen(stats.last) : "—"} accentVar="--av3-c4" />
      </div>

      <Card>
        <CardHead title="Sign off a shift" />
        <CardBody>
          <div className="av3-formrow" style={{ gridTemplateColumns: "150px 130px 1fr 1fr", marginBottom: 12 }}>
            <label className="av3-field"><span className="av3-field-label">Shift</span>
              <select className="av3-select" value={shift} onChange={(e) => setShift(e.target.value)}>{SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
            <label className="av3-field"><span className="av3-field-label">Cash counted (zł)</span><input className="av3-input" type="number" step="0.01" value={cashStr} onChange={(e) => setCashStr(e.target.value)} placeholder="opt." /></label>
            <label className="av3-field"><span className="av3-field-label">Outgoing manager</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={outgoing} onChange={(e) => setOutgoing(e.target.value)} placeholder="name" /></label>
            <label className="av3-field"><span className="av3-field-label">Incoming (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={incoming} onChange={(e) => setIncoming(e.target.value)} placeholder="name" /></label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span className="av3-field-label">Checks:</span>
            <button type="button" className="av3-toggle" data-on={tempOk} onClick={() => setTempOk((v) => !v)} style={{ padding: "0 12px" }}>Temps {tempOk ? "OK" : "✕"}</button>
            <button type="button" className="av3-toggle" data-on={wasteNoted} onClick={() => setWasteNoted((v) => !v)} style={{ padding: "0 12px" }}>Waste logged {wasteNoted ? "OK" : "✕"}</button>
            <button type="button" className="av3-toggle" data-on={equipOk} onClick={() => setEquipOk((v) => !v)} style={{ padding: "0 12px" }}>Equipment {equipOk ? "OK" : "✕"}</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <label className="av3-field" style={{ flex: 1 }}><span className="av3-field-label">Comment (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="anything the next manager should know" /></label>
            <Button variant="primary" size="sm" loading={saving} disabled={!canSubmit} onClick={submit}>Record handover</Button>
          </div>
        </CardBody>
      </Card>

      <Card style={{ padding: 0 }}>
        {logs.length === 0 ? (
          <div className="av3-empty"><div className="av3-empty-title">No handovers this week</div><div className="av3-empty-text">Sign off the first shift above.</div></div>
        ) : (
          <Table columns={cols} rows={logs} rowKey={(h) => h.id} />
        )}
      </Card>
    </>
  );
}
