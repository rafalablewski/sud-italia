"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Thermometer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHero,
  Select,
} from "./v2/ui";
import { getActiveLocations } from "@/data/locations";
import { HACCP_SENSORS, rangeForSensor, tempVerdict } from "@/lib/haccp";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

interface TempReading {
  id: string;
  locationSlug: string;
  sensor: string;
  /** Tenths of a degree Celsius. */
  tempCelsius: number;
  status: "ok" | "flagged";
  recordedBy?: string;
  recordedAt: string;
}

function fmtTemp(tenths: number): string {
  return `${(tenths / 10).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
}

function bandLabel(sensor: string): string {
  const r = rangeForSensor(sensor);
  return `safe ${fmtTemp(r.minTenths)} – ${fmtTemp(r.maxTenths)}`;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * HACCP temperature log (audit §11.2 / §12.4 #5). Staff record cold/hot-holding
 * readings each shift; out-of-band readings are flagged + audit-logged for
 * inspectors and insurers. Per-location — a probe reading belongs to one truck.
 */
export function AdminHaccp() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  // Site comes from the shell scope (topbar ScopeSwitcher). Operational pages
  // can't span trucks, so an "all" scope falls back to the first active location.
  const pageLoc = globalLoc && globalLoc !== "all" ? globalLoc : FALLBACK_LOC;

  const [logs, setLogs] = useState<TempReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [sensor, setSensor] = useState<string>(HACCP_SENSORS[0]);
  const [tempStr, setTempStr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ location: pageLoc, from: startOfTodayIso() });
      const res = await fetch(`/api/admin/haccp?${qs.toString()}`);
      setLogs(res.ok ? await res.json() : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    void load();
  }, [load]);

  const tempTenths =
    tempStr.trim() === "" || Number.isNaN(parseFloat(tempStr))
      ? null
      : Math.round(parseFloat(tempStr) * 10);
  const previewVerdict = tempTenths === null ? null : tempVerdict(sensor, tempTenths);

  const flaggedToday = useMemo(() => logs.filter((l) => l.status === "flagged").length, [logs]);

  const record = async () => {
    if (tempTenths === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/haccp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug: pageLoc, sensor, tempCelsius: tempTenths }),
      });
      if (res.ok) {
        const saved: TempReading = await res.json();
        if (saved.status === "flagged") {
          toast.error(
            "Out of range — logged",
            `${saved.sensor} at ${fmtTemp(saved.tempCelsius)} · ${bandLabel(saved.sensor)}. Act now.`,
          );
        } else {
          toast.success("Reading logged", `${saved.sensor} · ${fmtTemp(saved.tempCelsius)}`);
        }
        setTempStr("");
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not log reading", data.error || "Try again.");
      }
    } catch {
      toast.error("Could not log reading", "Network error.");
    } finally {
      setSaving(false);
    }
  };

  const locName = activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

  return (
    <div className="v2-page">
      <PageHero
        title="HACCP temperature log"
        subtitle="Cold- and hot-holding checks per shift. Out-of-range readings are flagged and audit-logged for inspectors and insurers."      />

      <section className="v2-kpi-grid">
        <Card padding="compact">
          <div className="v2-kds-stat">
            <Thermometer className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{logs.length}</div>
              <div className="v2-kds-stat-label">Readings today</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <AlertTriangle
              className="h-4 w-4"
              style={{ color: flaggedToday > 0 ? "var(--danger)" : "var(--success)" }}
            />
            <div>
              <div className="v2-kds-stat-value tabular">{flaggedToday}</div>
              <div className="v2-kds-stat-label">Flagged today</div>
            </div>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Log a reading" description={bandLabel(sensor)} />
        <CardBody>
          <div className="v2-form-row-2">
            <Select
              label="Holding point"
              value={sensor}
              onChange={(e) => setSensor(e.target.value)}
              options={HACCP_SENSORS.map((s) => ({ value: s, label: s }))}
            />
            <Input
              label="Temperature"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={tempStr}
              onChange={(e) => setTempStr(e.target.value)}
              placeholder="0.0"
              trailingAdornment={<span className="v2-muted">°C</span>}
              description={
                previewVerdict === "flagged"
                  ? `Out of the ${bandLabel(sensor)} band — will be flagged.`
                  : previewVerdict === "ok"
                    ? "In range."
                    : undefined
              }
            />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={record}
              disabled={saving || tempTenths === null}
              leadingIcon={<Thermometer className="h-3.5 w-3.5" />}
            >
              {saving ? "Logging…" : "Log reading"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Today's readings"
          description={`${logs.length} reading${logs.length === 1 ? "" : "s"} at ${locName}.`}
        />
        <CardBody>
          {loading ? (
            <div className="v2-page-loading">Loading…</div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Thermometer}
              title="No readings yet today"
              description="Log the first cold/hot-holding check above."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {logs.map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{l.sensor}</div>
                    <div className="v2-muted" style={{ fontSize: "0.8125rem" }}>{bandLabel(l.sensor)}</div>
                  </div>
                  <span className="tabular" style={{ fontWeight: 600 }}>{fmtTemp(l.tempCelsius)}</span>
                  <Badge tone={l.status === "flagged" ? "danger" : "success"}>
                    {l.status === "flagged" ? (
                      <><AlertTriangle className="h-3 w-3" /> Flagged</>
                    ) : (
                      <><CheckCircle2 className="h-3 w-3" /> OK</>
                    )}
                  </Badge>
                  <span className="v2-muted tabular" style={{ minWidth: 56, textAlign: "right", fontSize: "0.8125rem" }}>
                    {new Date(l.recordedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
