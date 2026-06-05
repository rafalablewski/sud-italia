"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Thermometer } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { HACCP_SENSORS, rangeForSensor, tempVerdict } from "@/lib/haccp";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Kpi, Table, type ColumnV3 } from "./ui";

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

export function HaccpV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [logs, setLogs] = useState<TempReading[]>([]);
  const [sensor, setSensor] = useState<string>(HACCP_SENSORS[0]);
  const [tempStr, setTempStr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ location: loc, from: startOfTodayIso() });
    const res = await fetch(`/api/admin/haccp?${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setLogs(Array.isArray(res) ? res : []);
  }, [loc]);

  useEffect(() => { load(); }, [load]);

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
      if (res.ok) { setTempStr(""); await load(); }
    } finally {
      setSaving(false);
    }
  };

  const flagged = logs.filter((l) => l.status === "flagged").length;
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

      <div className="av3-kpi-rail">
        <Kpi label="Readings today" icon={Thermometer} value={`${logs.length}`} accentVar="--av3-c3" />
        <Kpi label="Out of range" icon={Thermometer} value={`${flagged}`} accentVar="--av3-c1" />
      </div>

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
        </CardBody>
      </Card>

      <Card style={{ padding: 0 }}>
        {logs.length === 0 ? (
          <div className="av3-empty"><div className="av3-empty-title">No readings today</div><div className="av3-empty-text">Log the first temperature check above.</div></div>
        ) : (
          <Table columns={cols} rows={logs} rowKey={(l) => l.id} />
        )}
      </Card>
    </>
  );
}
