"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, Package, Play, Plus, Square, Timer, Trash2, Truck, Zap } from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";
import { useToast } from "./v2/ui/Toast";
import { formatPricePLN } from "@/lib/utils";

interface SimOrder {
  id: string;
  status: string;
  customerName: string;
  itemCount: number;
  total: number;
  createdAt: string;
  fulfillmentType: string;
}

const RATE_OPTIONS = [
  { value: "8000", label: "Trickle · 1 every 8s" },
  { value: "4000", label: "Steady · 1 every 4s" },
  { value: "2000", label: "Lunch rush · 1 every 2s" },
];

const ADVANCE_MS = 3000;
const ACTIVE_STATUSES = new Set(["confirmed", "preparing", "ready"]);

// Mirror the live KDS board's columns so the in-tab simulation reads exactly
// like the real Kitchen Display — without ever touching it.
const SIM_COLUMNS: { id: string; label: string; tone: "warning" | "info" | "success" }[] = [
  { id: "confirmed", label: "New", tone: "warning" },
  { id: "preparing", label: "In progress", tone: "info" },
  { id: "ready", label: "Ready · Expo", tone: "success" },
];

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function AdminKdsSimulator() {
  const { location, activeLocations } = useAdminLocation();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState("4000");
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Keep the latest location in a ref so the long-lived intervals always
  // post to the currently-selected truck without re-subscribing.
  const locationRef = useRef(location);
  locationRef.current = location;

  const call = useCallback(
    async (body: Record<string, unknown>): Promise<unknown | null> => {
      const loc = locationRef.current;
      const qs = loc ? `?location=${encodeURIComponent(loc)}` : "";
      try {
        const res = await fetch(`/api/admin/kds-simulator${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const loc = locationRef.current;
    const qs = loc ? `?location=${encodeURIComponent(loc)}` : "";
    try {
      const res = await fetch(`/api/admin/kds-simulator${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as { orders?: SimOrder[] };
      setOrders(data.orders ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  // 1s tick so the per-ticket age clocks stay live on the board.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Steady background loop: advance in-flight tickets toward done and refresh
  // the list — runs whether or not we're actively spawning, so a manual
  // spawn still progresses and a Stop lets the board settle to completion.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void (async () => {
        await call({ action: "advance" });
        await refresh();
      })();
    }, ADVANCE_MS);
    return () => clearInterval(t);
  }, [call, refresh, location]);

  // Spawn loop — only while running.
  useEffect(() => {
    if (!running) return;
    const spawn = () =>
      void (async () => {
        await call({ action: "spawn", count: 1 });
        await refresh();
      })();
    spawn(); // fire one immediately so Start feels responsive
    const t = setInterval(spawn, Number(rate));
    return () => clearInterval(t);
  }, [running, rate, call, refresh]);

  const spawnNow = useCallback(
    async (count: number) => {
      setBusy(true);
      try {
        const res = (await call({ action: "spawn", count })) as
          | { ok?: boolean; spawned?: number; error?: string }
          | null;
        if (res?.error) toast.warning(res.error);
        else if (res?.spawned) toast.success(`Spawned ${res.spawned} ticket${res.spawned > 1 ? "s" : ""}`);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [call, refresh, toast],
  );

  const purge = useCallback(async () => {
    setRunning(false);
    setBusy(true);
    try {
      const res = (await call({ action: "purge" })) as { removed?: number } | null;
      toast.success(`Purged ${res?.removed ?? 0} simulated order${res?.removed === 1 ? "" : "s"}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [call, refresh, toast]);

  const activeCount = useMemo(() => orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length, [orders]);
  const completedCount = orders.length - activeCount;

  // Group active tickets into the board columns, oldest-first within each so
  // the most-urgent ticket sits at the top — same ordering as the real KDS.
  const byColumn = useMemo(() => {
    const map = new Map<string, SimOrder[]>();
    for (const col of SIM_COLUMNS) map.set(col.id, []);
    for (const o of orders) map.get(o.status)?.push(o);
    for (const arr of map.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [orders]);

  const targetLocationLabel = location
    ? activeLocations.find((l) => l.slug === location)?.name ?? location
    : `${activeLocations[0]?.name ?? "first truck"} (no location selected — defaults to first truck)`;

  return (
    <div className="v2-page">
      <Card>
        <CardHeader
          title="KDS live-order simulator"
          description="Streams synthetic orders — built only from this truck's real menu — onto the in-tab Kitchen Display board below, so you can demo or train against a live rush. Simulated tickets stay inside this tab: they never appear on the real KDS, the kitchen screens, the dashboard, the Orders list or any report, and never touch stock, CRM or customer comms. Stop anytime and purge in one click."
          actions={<Zap className="h-4 w-4 v2-muted" />}
        />
        <CardBody>
          <div className="v2-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Target: <strong>{targetLocationLabel}</strong> — change the truck from the top-bar location selector. Tickets land on the board below and walk New → In progress → Ready → Done automatically.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 200 }}>
              <Select
                label="Spawn rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                options={RATE_OPTIONS}
                disabled={running}
              />
            </div>
            {running ? (
              <Button variant="danger" leadingIcon={<Square className="h-3.5 w-3.5" />} onClick={() => setRunning(false)}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" leadingIcon={<Play className="h-3.5 w-3.5" />} onClick={() => setRunning(true)}>
                Start
              </Button>
            )}
            <Button variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => spawnNow(1)} disabled={busy}>
              Spawn one
            </Button>
            <Button variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => spawnNow(5)} disabled={busy}>
              Spawn 5
            </Button>
            <Button variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={purge} disabled={busy || orders.length === 0}>
              Purge all
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="v2-kpi-grid">
        <KpiCard label="Active tickets" value={activeCount} icon={ChefHat} tone="brand" staticValue hint="confirmed · preparing · ready" />
        <KpiCard label="Completed" value={completedCount} icon={Zap} tone="success" staticValue hint="left the board — purge to clear" />
        <KpiCard label="Generator" value={running ? 1 : 0} display={running ? "Running" : "Stopped"} icon={Play} tone={running ? "success" : "neutral"} staticValue />
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Zap}
              title="No simulated tickets"
              description="Press Start to stream a rush, or Spawn one to drop a single ticket. They appear on the simulated board here — and nowhere else."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-kds-board">
          {SIM_COLUMNS.map((col) => {
            const tickets = byColumn.get(col.id) ?? [];
            return (
              <div key={col.id} className={`v2-kds-col v2-kds-col-${col.tone}`}>
                <div className="v2-kds-col-header">
                  <Badge tone={col.tone} variant="solid">
                    {col.label}
                  </Badge>
                  <span className="v2-kds-col-count">{tickets.length}</span>
                </div>
                <div className="v2-kds-col-body">
                  {tickets.length === 0 ? (
                    <div className="v2-kds-col-empty">No tickets here.</div>
                  ) : (
                    tickets.map((o) => <SimTicket key={o.id} order={o} nowMs={now} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SimTicket({ order, nowMs }: { order: SimOrder; nowMs: number }) {
  const ageSeconds = Math.max(0, Math.round((nowMs - Date.parse(order.createdAt)) / 1000));
  const isDelivery = order.fulfillmentType === "delivery";
  return (
    <div className="v2-ticket">
      <header className="v2-ticket-header">
        <span className="v2-ticket-id mono">{order.id.slice(-6).toUpperCase()}</span>
        <span className="v2-ticket-timer v2-ticket-timer-neutral">
          <Timer className="h-3 w-3" /> {fmtClock(ageSeconds)}
        </span>
      </header>
      <div className="v2-ticket-meta">
        <span className="v2-ticket-customer">{order.customerName}</span>
        <span className="v2-ticket-channel">
          {isDelivery ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {isDelivery ? "Delivery" : "Takeout"}
        </span>
      </div>
      <div className="v2-ticket-meta">
        <span>
          {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
        </span>
        <span className="tabular">{formatPricePLN(order.total)}</span>
      </div>
    </div>
  );
}
