"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Clock, LayoutGrid, Rows3, Scale } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Dialog, InfoButton, Kpi, Switch, Table, type BadgeTone, type ColumnV3 } from "./ui";

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
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"all" | string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

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
  const checksClear = tempOk && wasteNoted && equipOk;

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

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((h) =>
      (shiftFilter === "all" || h.shift === shiftFilter) &&
      (!needle || h.outgoingManager.toLowerCase().includes(needle) || (h.incomingManager ?? "").toLowerCase().includes(needle)));
  }, [logs, q, shiftFilter]);
  const detail = detailId ? logs.find((h) => h.id === detailId) ?? null : null;

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

  const CheckPill = ({ ok, label }: { ok: boolean; label: string }) => <Badge tone={ok ? "ok" : "bad"} dot>{label}</Badge>;

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
        <Kpi label="Issues flagged" icon={AlertTriangle} value={`${stats.issues}`} accentVar="--av3-c1"
          info={<InfoButton title="Issues flagged this week" description="Number of sign-offs in the last 7 days where at least one shift check (temps, waste, equipment) was not clear."
            institutional="The handover is the operational control that stops a small problem becoming tomorrow's crisis — a fridge left warm overnight, a slicer fault not flagged, waste not rotated. Each flagged sign-off is a baton-pass where something was wrong; the value is in whether the incoming manager acted. A cluster on one site or shift is a process or equipment signal, not individual error."
            plain="Closing manager marks 'equipment' red because the dough mixer is making a noise. That flag is the difference between a planned service on Tuesday and a dead mixer mid-Friday-rush — it's the system working, but a rising count means something needs fixing for good."
            tips="Read every flag at the next open and close it; if equipment flags repeat, book the service rather than re-noting it nightly; if temps flag, cross-check the HACCP log; use the comment field so the next manager inherits context, not just a red dot."
            methodology="Count of handovers in the trailing 7 days where tempChecksOk, wasteNoted or equipmentOk is false (/api/admin/handover)." />} />
        <Kpi label="Net cash variance" icon={Scale} value={`${stats.netVar >= 0 ? "+" : ""}${formatPrice(stats.netVar)}`} accentVar="--av3-c2"
          info={<InfoButton title="Net cash variance" description="Sum of counted-vs-expected drawer differences across this week's sign-offs — over (+) or short (−)."
            institutional="Cash variance is the integrity signal on the till: small, random, near-zero net is healthy; a persistent one-direction drift is the classic indicator of a process leak or, worst case, shrinkage. Auditors and the CFO care less about a single odd night than about the trend and the spread — a net near zero that hides a ±500 zł swing each day is still a control problem."
            plain="If Monday was −40 zł and Tuesday +35 zł, the net is −5 zł — basically rounding, nothing to chase. But if it's −40 every single night, that's ~1,200 zł a month walking out, and it's worth finding out where."
            tips="Investigate any single variance over your comp cap, not just the net; count the drawer blind (before seeing expected) so the number is honest; if one operator's shifts always run short, retrain or watch the void/refund pattern; reconcile against the Cash page."
            methodology="Sum of cashVarianceGrosze (counted − expected drawer) over this week's handovers. Per-sign-off tone in the table: green <2 zł, amber <10 zł, red ≥10 zł absolute." />} />
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
            <Switch checked={tempOk} label="Temps" onChange={setTempOk} />
            <Switch checked={wasteNoted} label="Waste logged" onChange={setWasteNoted} />
            <Switch checked={equipOk} label="Equipment" onChange={setEquipOk} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <label className="av3-field" style={{ flex: 1 }}><span className="av3-field-label">Comment (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="anything the next manager should know" /></label>
            <Button variant="primary" size="sm" loading={saving} disabled={!canSubmit} onClick={submit}>Record handover</Button>
          </div>
          {/* live sign-off summary — reflects the form before you commit */}
          {canSubmit && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", border: `1px solid ${checksClear ? "var(--av3-line)" : "color-mix(in oklab, var(--av3-warn) 35%, var(--av3-line))"}`, borderRadius: "var(--av3-r-md)", background: checksClear ? "var(--av3-s2)" : "var(--av3-warn-soft)" }}>
              <Badge tone="info">{SHIFT_LABEL[shift]}</Badge>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{outgoing.trim()}</span>
              {incoming.trim() && <span className="av3-cell-muted" style={{ fontSize: 11.5 }}>→ {incoming.trim()}</span>}
              <span style={{ flex: 1 }} />
              <CheckPill ok={tempOk} label="Temps" />
              <CheckPill ok={wasteNoted} label="Waste" />
              <CheckPill ok={equipOk} label="Equip" />
              {cashStr.trim() !== "" && <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 12 }}>cash {formatPrice(Math.round(parseFloat(cashStr) * 100) || 0)}</span>}
              {!checksClear && <span style={{ fontSize: 11, color: "var(--av3-warn)", width: "100%" }}>One or more checks are not clear — this will flag the sign-off for the incoming manager.</span>}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manager…" />
        <span className="av3-toolbar-spacer" />
        <div className="av3-filterchips" style={{ margin: 0 }}>
          <button type="button" className={`av3-fchip ${shiftFilter === "all" ? "is-active" : ""}`} onClick={() => setShiftFilter("all")}>All<span className="av3-fchip-count">{logs.length}</span></button>
          {SHIFTS.filter((s) => logs.some((h) => h.shift === s.value)).map((s) => (
            <button key={s.value} type="button" className={`av3-fchip ${shiftFilter === s.value ? "is-active" : ""}`} onClick={() => setShiftFilter(s.value)}>{s.label}<span className="av3-fchip-count">{logs.filter((h) => h.shift === s.value).length}</span></button>
          ))}
        </div>
        <div className="av3-viewtoggle" role="tablist" aria-label="Handover view">
          <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
          <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="av3-empty"><div className="av3-empty-title">{logs.length === 0 ? "No handovers this week" : "Nothing matches"}</div><div className="av3-empty-text">{logs.length === 0 ? "Sign off the first shift above." : "Adjust the search or filter."}</div></div>
        </Card>
      ) : view === "table" ? (
        <Card style={{ padding: 0 }}>
          <Table columns={cols} rows={rows} rowKey={(h) => h.id} onRowClick={(h) => setDetailId(h.id)} />
        </Card>
      ) : (
        <div className="av3-board">
          {rows.map((h) => {
            return (
              <div key={h.id} className="av3-dcard" role="button" tabIndex={0}
                onClick={() => setDetailId(h.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(h.id); } }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <div className="av3-dcard-name">{h.outgoingManager}</div>
                  <span className="av3-cell-muted" style={{ fontSize: 11 }}>{fmtWhen(h.recordedAt)}</span>
                </div>
                <div className="av3-dcard-badges">
                  <Badge tone="info">{SHIFT_LABEL[h.shift] ?? h.shift}</Badge>
                  <CheckPill ok={h.tempChecksOk} label="Temps" />
                  <CheckPill ok={h.wasteNoted} label="Waste" />
                  <CheckPill ok={h.equipmentOk} label="Equip" />
                </div>
                <div className="av3-dcard-foot" style={{ paddingTop: 8 }}>
                  <div>
                    {typeof h.cashVarianceGrosze === "number"
                      ? <Badge tone={varianceTone(h.cashVarianceGrosze)}>{h.cashVarianceGrosze >= 0 ? "+" : ""}{formatPrice(h.cashVarianceGrosze)}</Badge>
                      : <span className="av3-cell-muted" style={{ fontSize: 11 }}>no cash count</span>}
                  </div>
                  <span className="av3-dcard-cta">Details →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <Dialog open onClose={() => setDetailId(null)} title={`${SHIFT_LABEL[detail.shift] ?? detail.shift} handover`} subtitle={`${city} · ${fmtWhen(detail.recordedAt)}`}
          headerExtra={typeof detail.cashVarianceGrosze === "number" ? <Badge tone={varianceTone(detail.cashVarianceGrosze)}>{detail.cashVarianceGrosze >= 0 ? "+" : ""}{formatPrice(detail.cashVarianceGrosze)}</Badge> : undefined} width={520}
          footer={<Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>Close</Button>}>
          <div className="av3-od-grid" style={{ marginBottom: 14 }}>
            <div className="av3-od-field"><div className="k">Outgoing</div><div className="v">{detail.outgoingManager}</div></div>
            <div className="av3-od-field"><div className="k">Incoming</div><div className="v">{detail.incomingManager || "—"}</div></div>
            <div className="av3-od-field"><div className="k">Cash counted</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{typeof detail.cashCountedGrosze === "number" ? formatPrice(detail.cashCountedGrosze) : "—"}</div></div>
            <div className="av3-od-field"><div className="k">Variance</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{typeof detail.cashVarianceGrosze === "number" ? `${detail.cashVarianceGrosze >= 0 ? "+" : ""}${formatPrice(detail.cashVarianceGrosze)}` : "—"}</div></div>
          </div>
          <div className="av3-field-label" style={{ marginBottom: 6 }}>Shift checks</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: detail.managerComment ? 14 : 0 }}>
            <CheckPill ok={detail.tempChecksOk} label="Temperatures" />
            <CheckPill ok={detail.wasteNoted} label="Waste logged" />
            <CheckPill ok={detail.equipmentOk} label="Equipment" />
          </div>
          {detail.managerComment && (
            <>
              <div className="av3-field-label" style={{ marginBottom: 6 }}>Manager comment</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: "10px 12px", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", background: "var(--av3-s2)" }}>{detail.managerComment}</div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
