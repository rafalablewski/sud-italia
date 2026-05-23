"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChefHat, Play, Plus, Square, Trash2, Zap } from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ORDER_STATUS_TONE,
  Select,
  Table,
  type Column,
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

export function AdminKdsSimulator() {
  const { location, activeLocations } = useAdminLocation();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState("4000");
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [busy, setBusy] = useState(false);

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

  const targetLocationLabel = location
    ? activeLocations.find((l) => l.slug === location)?.name ?? location
    : `${activeLocations[0]?.name ?? "first truck"} (no location selected — defaults to first truck)`;

  const columns: Column<SimOrder>[] = [
    {
      key: "id",
      header: "Ticket",
      sortValue: (o) => o.createdAt,
      cell: (o) => <span className="tabular" style={{ fontSize: 12 }}>{o.id}</span>,
    },
    { key: "customer", header: "Customer", cell: (o) => o.customerName },
    {
      key: "type",
      header: "Type",
      cell: (o) => <span className="v2-muted" style={{ textTransform: "capitalize" }}>{o.fulfillmentType}</span>,
    },
    { key: "items", header: "Items", align: "right", sortValue: (o) => o.itemCount, cell: (o) => <span className="tabular">{o.itemCount}</span> },
    { key: "total", header: "Total", align: "right", sortValue: (o) => o.total, cell: (o) => <span className="tabular">{formatPricePLN(o.total)}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (o) => o.status,
      cell: (o) => (
        <Badge tone={ORDER_STATUS_TONE[o.status] ?? "neutral"} variant="soft">
          {o.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <Card>
        <CardHeader
          title="KDS live-order simulator"
          description="Streams synthetic orders — built only from this truck's real menu — into the Kitchen Display so you can demo or train against a live rush. Simulated tickets are tagged and excluded from every report; they never touch stock, CRM or customer comms. Stop anytime and purge in one click."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Zap className="h-4 w-4 v2-muted" />
              <Link href="/admin/kds" className="v2-btn v2-btn-ghost v2-btn-sm" target="_blank">
                <ChefHat className="h-3.5 w-3.5" />
                <span className="v2-btn-label">Open KDS</span>
              </Link>
            </span>
          }
        />
        <CardBody>
          <div className="v2-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Target: <strong>{targetLocationLabel}</strong> — change the truck from the top-bar location selector. Open the KDS in a second tab to watch tickets land.
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
        <KpiCard label="Active on KDS" value={activeCount} icon={ChefHat} tone="brand" staticValue hint="confirmed · preparing · ready" />
        <KpiCard label="Completed" value={completedCount} icon={Zap} tone="success" staticValue hint="left the board — purge to clear" />
        <KpiCard label="Generator" value={running ? 1 : 0} display={running ? "Running" : "Stopped"} icon={Play} tone={running ? "success" : "neutral"} staticValue />
      </div>

      <Card>
        <CardHeader title="Simulated tickets" description="Every synthetic order currently in the system for this truck. Auto-advances confirmed → preparing → ready → completed." />
        <CardBody>
          {orders.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No simulated tickets"
              description="Press Start to stream a rush, or Spawn one to drop a single ticket. Watch them appear on the KDS."
            />
          ) : (
            <Table rows={orders} columns={columns} rowKey={(o) => o.id} defaultSort={{ key: "id", dir: "desc" }} density="compact" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
