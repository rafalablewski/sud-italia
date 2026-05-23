"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChefHat, CheckCircle2, Clock, RefreshCw, TrendingUp } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, type BadgeTone } from "./v2/ui";
import { KpiCard } from "./v2/charts";
import { formatPricePLN } from "@/lib/utils";

interface Tile {
  slug: string;
  name: string;
  open: number;
  late: number;
  warning: number;
  oldestAgeSec: number;
  completedToday: number;
  revenueToday: number;
  worstStationP95Ms: number | null;
  ticketsBumped: number;
  health: "red" | "amber" | "green";
}

interface FleetData {
  generatedAt: string;
  totals: { open: number; late: number; completedToday: number; revenueToday: number; trucksInRed: number };
  tiles: Tile[];
}

const POLL_MS = 6000;
const HEALTH_TONE: Record<Tile["health"], BadgeTone> = { red: "danger", amber: "warning", green: "success" };
const HEALTH_LABEL: Record<Tile["health"], string> = { red: "Behind", amber: "Watch", green: "On time" };

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AdminKdsFleet({ onDrillIn }: { onDrillIn?: (slug: string) => void }) {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/admin/kds/fleet");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as FleetData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const tiles = data?.tiles ?? [];
  const totals = data?.totals;

  return (
    <div className="v2-page">
      <Card>
        <CardHeader
          title="Fleet command"
          description="Live kitchen-display health across every active truck. Auto-refreshes every few seconds. Click a truck to drop into its floor board."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              {data && (
                <span className="v2-muted" style={{ fontSize: 12 }}>
                  Updated {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              )}
              <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
                Refresh
              </Button>
            </span>
          }
        />
      </Card>

      {loading && !data && (
        <Card><CardBody><div className="v2-muted" style={{ padding: 24, textAlign: "center" }}>Loading fleet…</div></CardBody></Card>
      )}

      {error && !data && (
        <Card><CardBody><EmptyState icon={AlertTriangle} title="Couldn't load fleet" description={error} /></CardBody></Card>
      )}

      {totals && (
        <div className="v2-kpi-grid">
          <KpiCard label="Open tickets" value={totals.open} icon={ChefHat} tone="brand" staticValue hint="across all trucks" />
          <KpiCard label="Late" value={totals.late} icon={AlertTriangle} tone={totals.late > 0 ? "danger" : "neutral"} staticValue hint="past promised-ready" />
          <KpiCard label="Trucks behind" value={totals.trucksInRed} icon={AlertTriangle} tone={totals.trucksInRed > 0 ? "danger" : "success"} staticValue hint="have a late ticket" />
          <KpiCard label="Completed today" value={totals.completedToday} icon={CheckCircle2} tone="success" staticValue />
          <KpiCard label="Revenue today" value={totals.revenueToday} display={formatPricePLN(totals.revenueToday)} icon={TrendingUp} tone="info" staticValue />
        </div>
      )}

      {data && tiles.length === 0 && (
        <Card><CardBody><EmptyState icon={ChefHat} title="No active trucks" description="Add or activate a location to see it here." /></CardBody></Card>
      )}

      {tiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <Card
              key={t.slug}
              role={onDrillIn ? "button" : undefined}
              tabIndex={onDrillIn ? 0 : undefined}
              onClick={onDrillIn ? () => onDrillIn(t.slug) : undefined}
              onKeyDown={onDrillIn ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrillIn(t.slug); } } : undefined}
              style={{
                cursor: onDrillIn ? "pointer" : "default",
                borderLeft: `4px solid ${t.health === "red" ? "rgb(220,38,38)" : t.health === "amber" ? "rgb(217,119,6)" : "rgb(22,163,74)"}`,
              }}
            >
              <CardBody>
                <div className="flex justify-between items-start" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                  <Badge tone={HEALTH_TONE[t.health]} variant="soft" dot>{HEALTH_LABEL[t.health]}</Badge>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span className="tabular" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{t.open}</span>
                  <span className="v2-muted" style={{ fontSize: 13 }}>open tickets</span>
                  {t.late > 0 && <Badge tone="danger" variant="soft">{t.late} late</Badge>}
                  {t.warning > 0 && <Badge tone="warning" variant="soft">{t.warning} soon</Badge>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  <Metric icon={<Clock className="h-3.5 w-3.5" />} label="Oldest" value={t.open > 0 ? fmtDur(t.oldestAgeSec) : "—"} />
                  <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Slowest P95" value={t.worstStationP95Ms != null ? fmtDur(Math.round(t.worstStationP95Ms / 1000)) : "—"} />
                  <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Done today" value={String(t.completedToday)} />
                  <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Revenue" value={formatPricePLN(t.revenueToday)} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span className="v2-muted" aria-hidden>{icon}</span>
      <span className="v2-muted">{label}</span>
      <span className="tabular" style={{ fontWeight: 600, marginLeft: "auto" }}>{value}</span>
    </span>
  );
}
