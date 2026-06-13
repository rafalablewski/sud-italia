"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Rows3, ShieldCheck, Thermometer, TriangleAlert } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { HACCP_SENSORS, rangeForSensor, tempVerdict } from "@/lib/haccp";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Dialog, InfoButton, Kpi, SkeletonKpiRail, SkeletonRows, Table, type ColumnV3 } from "./ui";

interface TempReading {
  id: string;
  locationSlug: string;
  sensor: string;
  tempCelsius: number; // tenths
  status: "ok" | "flagged";
  recordedAt: string;
}

function fmtTemp(tenths: number) {
  return `${(tenths / 10).toFixed(1)} °C`;
}
function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/** Live safe-range gauge — the safe band is shaded; a marker shows where the
 *  reading sits. The domain pads the band so an out-of-range reading is still
 *  visible off the green. Used in the record form and the detail popup. */
function RangeGauge({ minTenths, maxTenths, valueTenths }: { minTenths: number; maxTenths: number; valueTenths: number | null }) {
  const span = Math.max(maxTenths - minTenths, 10);
  const pad = Math.max(span * 0.6, 50);
  const lo = minTenths - pad;
  const hi = maxTenths + pad;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - lo) / (hi - lo)) * 100));
  const bandL = pct(minTenths);
  const bandR = pct(maxTenths);
  const flagged = valueTenths !== null && (valueTenths < minTenths || valueTenths > maxTenths);
  return (
    <div>
      <div style={{ position: "relative", height: 10, borderRadius: "var(--av3-r-pill)", background: "var(--av3-s3)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: `${bandL}%`, width: `${bandR - bandL}%`, top: 0, bottom: 0, background: "color-mix(in oklab, var(--av3-ok) 45%, var(--av3-s3))" }} />
        {valueTenths !== null && (
          <div style={{ position: "absolute", left: `${pct(valueTenths)}%`, top: -3, width: 3, height: 16, transform: "translateX(-50%)", borderRadius: 2, background: flagged ? "var(--av3-bad)" : "var(--av3-fg)" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>
        <span>{fmtTemp(lo)}</span>
        <span style={{ color: "var(--av3-ok)" }}>safe {fmtTemp(minTenths)}–{fmtTemp(maxTenths)}</span>
        <span>{fmtTemp(hi)}</span>
      </div>
    </div>
  );
}

export function HaccpV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [logs, setLogs] = useState<TempReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [sensor, setSensor] = useState<string>(HACCP_SENSORS[0]);
  const [tempStr, setTempStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ location: loc, from: startOfTodayIso() });
    const res = await fetch(`/api/admin/haccp?${qs}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(res) ? res : []);
    setLoading(false);
  }, [loc]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const tempTenths = tempStr.trim() === "" || Number.isNaN(Number(tempStr)) ? null : Math.round(Number(tempStr) * 10);
  const verdict = tempTenths === null ? null : tempVerdict(sensor, tempTenths);
  const range = rangeForSensor(sensor);

  const record = async () => {
    if (tempTenths === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/haccp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: loc, sensor, tempCelsius: tempTenths }),
      });
      if (res.ok) {
        // Show the new reading instantly from the POST response, then
        // reconcile with the server in the background — no refetch wait.
        const created = (await res.json().catch(() => null)) as TempReading | null;
        if (created?.id) setLogs((prev) => [created, ...prev.filter((l) => l.id !== created.id)]);
        setTempStr("");
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const flagged = logs.filter((l) => l.status === "flagged").length;
  const compliancePct = logs.length ? Math.round(((logs.length - flagged) / logs.length) * 100) : null;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((l) =>
      (filter === "all" || l.status === "flagged") &&
      (!needle || l.sensor.toLowerCase().includes(needle) || fmtTemp(l.tempCelsius).includes(needle)));
  }, [logs, q, filter]);
  const detail = detailId ? logs.find((l) => l.id === detailId) ?? null : null;

  const cols: ColumnV3<TempReading>[] = [
    { key: "t", header: "Time", render: (l) => <span className="av3-cell-muted">{fmtTime(l.recordedAt)}</span> },
    { key: "s", header: "Sensor", render: (l) => l.sensor },
    { key: "temp", header: "Temp", num: true, render: (l) => fmtTemp(l.tempCelsius) },
    { key: "st", header: "Status", render: (l) => <Badge tone={l.status === "flagged" ? "bad" : "ok"} dot>{l.status === "flagged" ? "Out of range" : "OK"}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>HACCP log</h1>
          <div className="av3-pagehead-sub">Cold / hot-holding temperature checks · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      {loading && logs.length === 0 ? <SkeletonKpiRail count={3} /> : (
      <div className="av3-kpi-rail">
        <Kpi label="Readings today" icon={Thermometer} value={`${logs.length}`} accentVar="--av3-c3" />
        <Kpi label="Compliance" icon={ShieldCheck} value={compliancePct === null ? "—" : `${compliancePct}%`} accentVar="--av3-c4"
          info={<InfoButton title="HACCP compliance" description="Share of today's temperature checks that landed inside the safe holding range for their sensor."
            institutional="Food-safety law (HACCP / EU 852/2004) treats cold-chain and hot-holding control as a critical limit, not a target — an inspector wants 100% in-range with corrective action logged for every breach. Below 100% is not a soft KPI miss; each flagged reading is a record an auditor will ask you to explain. The gate is binary: green or a documented fix."
            plain="Twelve checks today, one fridge reading at 7 °C instead of ≤5 °C → 92%. That one breach is the one the inspector circles — so you want it caught, acted on (move stock, call the engineer) and logged, not buried."
            tips="Check at fixed times each shift so gaps don't look like skipped controls; when a reading flags, act immediately and note it; calibrate probes monthly; if one sensor flags repeatedly it's a failing unit, not bad luck — escalate it."
            methodology="(readings − flagged) ÷ readings for today, where flagged = temp outside the sensor's safe band (tempVerdict in @/lib/haccp). Counts only today's readings for this location." />} />
        <Kpi label="Out of range" icon={TriangleAlert} value={`${flagged}`} accentVar="--av3-c1"
          info={<InfoButton title="Out-of-range readings" description="Count of today's temperature checks that fell outside the safe holding band and need corrective action."
            institutional="Every out-of-range reading is a critical-control-point breach that must carry a documented corrective action to satisfy an audit. The number itself matters less than whether each one is closed out — an unactioned breach is the finding that fails an inspection and, worse, the one that precedes a spoilage or food-safety incident."
            plain="If the hot-hold cabinet reads 58 °C when it must be ≥63 °C, the pasta in it is in the danger zone — that flag means reheat or bin it now and note what you did, not at the end of the shift."
            tips="Treat any flag as act-now: move or discard the stock, fix or swap the unit, and log the action; a recurring flag on one sensor is a hardware fault — book a service; never clear a flag without recording why it's safe to continue."
            methodology="Count of today's readings with status === 'flagged' (temp outside the sensor band) from /api/admin/haccp for this location." />} />
      </div>
      )}

      <Card>
        <CardHead title="Record a reading" description={`${sensor} · safe ${fmtTemp(range.minTenths)}–${fmtTemp(range.maxTenths)}`} />
        <CardBody>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ minWidth: 200 }}><span className="av3-field-label">Sensor</span>
              <select className="av3-select" value={sensor} onChange={(e) => setSensor(e.target.value)}>
                {HACCP_SENSORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Temp (°C)</span>
              <input className="av3-input" type="number" step="0.1" value={tempStr} onChange={(e) => setTempStr(e.target.value)} placeholder="4.0" />
            </label>
            {verdict && <Badge tone={verdict === "flagged" ? "bad" : "ok"} dot>{verdict === "flagged" ? "Out of range" : "In range"}</Badge>}
            <Button variant="primary" size="sm" loading={saving} disabled={tempTenths === null} onClick={record} style={{ marginLeft: "auto" }}>Log reading</Button>
          </div>
          {/* live range gauge — updates as you type, before you commit */}
          <div style={{ marginTop: 14, maxWidth: 460 }}>
            <RangeGauge minTenths={range.minTenths} maxTenths={range.maxTenths} valueTenths={tempTenths} />
            {tempTenths !== null && (
              <div style={{ fontSize: 11.5, marginTop: 7, color: verdict === "flagged" ? "var(--av3-bad)" : "var(--av3-muted)" }}>
                {verdict === "flagged"
                  ? `${fmtTemp(tempTenths)} is outside the safe band — logging this will flag a breach and you'll need a corrective action.`
                  : `${fmtTemp(tempTenths)} is within the safe band for ${sensor}.`}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sensor / temp…" />
        <span className="av3-toolbar-spacer" />
        <div className="av3-filterchips" style={{ margin: 0 }}>
          <button type="button" className={`av3-fchip ${filter === "all" ? "is-active" : ""}`} onClick={() => setFilter("all")}>All<span className="av3-fchip-count">{logs.length}</span></button>
          <button type="button" className={`av3-fchip ${filter === "flagged" ? "is-active" : ""}`} onClick={() => setFilter("flagged")}>Out of range<span className="av3-fchip-count">{flagged}</span></button>
        </div>
        <div className="av3-viewtoggle" role="tablist" aria-label="Reading view">
          <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
          <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <Card style={{ padding: 12 }}><SkeletonRows rows={6} /></Card>
      ) : rows.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="av3-empty"><div className="av3-empty-title">{logs.length === 0 ? "No readings today" : "Nothing matches"}</div><div className="av3-empty-text">{logs.length === 0 ? "Log the first temperature check above." : "Adjust the search or filter."}</div></div>
        </Card>
      ) : view === "table" ? (
        <Card style={{ padding: 0 }}>
          <Table columns={cols} rows={rows} rowKey={(l) => l.id} onRowClick={(l) => setDetailId(l.id)} />
        </Card>
      ) : (
        <div className="av3-board">
          {rows.map((l) => {
            const r = rangeForSensor(l.sensor);
            return (
              <div key={l.id} className="av3-dcard" role="button" tabIndex={0}
                onClick={() => setDetailId(l.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(l.id); } }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <div className="av3-dcard-name">{l.sensor}</div>
                  <span className="av3-cell-muted" style={{ fontSize: 11 }}>{fmtTime(l.recordedAt)}</span>
                </div>
                <div className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 22, fontWeight: 650, color: l.status === "flagged" ? "var(--av3-bad)" : "var(--av3-fg)" }}>{fmtTemp(l.tempCelsius)}</div>
                <RangeGauge minTenths={r.minTenths} maxTenths={r.maxTenths} valueTenths={l.tempCelsius} />
                <div className="av3-dcard-foot" style={{ paddingTop: 8 }}>
                  <Badge tone={l.status === "flagged" ? "bad" : "ok"} dot>{l.status === "flagged" ? "Out of range" : "OK"}</Badge>
                  <span className="av3-dcard-cta">Details →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <Dialog open onClose={() => setDetailId(null)} title={detail.sensor} subtitle={`${city} · ${fmtTime(detail.recordedAt)}`}
          headerExtra={<Badge tone={detail.status === "flagged" ? "bad" : "ok"} dot>{detail.status === "flagged" ? "Out of range" : "In range"}</Badge>} width={520}
          footer={<Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>Close</Button>}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 40, fontWeight: 700, color: detail.status === "flagged" ? "var(--av3-bad)" : "var(--av3-fg)" }}>{fmtTemp(detail.tempCelsius)}</div>
          </div>
          {(() => { const r = rangeForSensor(detail.sensor); return <RangeGauge minTenths={r.minTenths} maxTenths={r.maxTenths} valueTenths={detail.tempCelsius} />; })()}
          <div className="av3-od-grid" style={{ marginTop: 16 }}>
            <div className="av3-od-field"><div className="k">Sensor</div><div className="v">{detail.sensor}</div></div>
            <div className="av3-od-field"><div className="k">Safe range</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 13 }}>{fmtTemp(rangeForSensor(detail.sensor).minTenths)}–{fmtTemp(rangeForSensor(detail.sensor).maxTenths)}</div></div>
            <div className="av3-od-field"><div className="k">Recorded</div><div className="v" style={{ fontSize: 12 }}>{new Date(detail.recordedAt).toLocaleString("pl-PL")}</div></div>
            <div className="av3-od-field"><div className="k">Location</div><div className="v">{city}</div></div>
          </div>
          {detail.status === "flagged" && (
            <div className="av3-edhint" data-tone="warn" style={{ marginTop: 14 }}>
              This reading is outside the safe band — make sure a corrective action (move/discard stock, fix or swap the unit) was taken and recorded.
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
