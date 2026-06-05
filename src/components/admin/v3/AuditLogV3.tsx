"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface Entry { id: string; actor: string; action: string; entityType?: string; entityId?: string; occurredAt: string }
type Filter = "all" | "orders" | "menu" | "feedback" | "settings" | "loyalty" | "staff" | "other";

function group(action: string): Filter {
  if (action.startsWith("orders.")) return "orders";
  if (action.startsWith("menu.")) return "menu";
  if (action.startsWith("feedback.")) return "feedback";
  if (action.startsWith("settings.")) return "settings";
  if (action.startsWith("loyalty.") || action.startsWith("points.")) return "loyalty";
  if (action.startsWith("staff.") || action.startsWith("shifts.")) return "staff";
  return "other";
}
function tone(action: string): BadgeTone {
  if (action.includes("delete") || action.includes("refund_full") || action.includes("dispute") || action.includes("cancel")) return "bad";
  if (action.includes("create") || action.includes("add") || action.includes("open")) return "ok";
  if (action.includes("update") || action.includes("edit")) return "info";
  return "neutral";
}
function fmt(iso: string) { return new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

export function AuditLogV3() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/audit-log?limit=500").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setEntries(Array.isArray(res) ? res : []);
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) c[group(e.action)] = (c[group(e.action)] ?? 0) + 1;
    return c;
  }, [entries]);
  const rows = useMemo(() => (filter === "all" ? entries : entries.filter((e) => group(e.action) === filter)), [entries, filter]);
  const chips: Filter[] = ["all", "orders", "menu", "feedback", "settings", "loyalty", "staff", "other"];

  const cols: ColumnV3<Entry>[] = [
    { key: "t", header: "When", render: (e) => <span className="av3-cell-muted">{fmt(e.occurredAt)}</span> },
    { key: "actor", header: "Actor", render: (e) => <span style={{ fontWeight: 500 }}>{e.actor}</span> },
    { key: "action", header: "Action", render: (e) => <Badge tone={tone(e.action)}>{e.action}</Badge> },
    { key: "entity", header: "Entity", render: (e) => <span className="av3-cell-muted">{e.entityType ? `${e.entityType}${e.entityId ? ` · ${e.entityId.slice(-8)}` : ""}` : "—"}</span> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Audit log</h1>
          <div className="av3-pagehead-sub">Every privileged action · append-only · last 500</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); load(); }}><RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh</Button>
        </div>
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
            {f}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading audit log…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No entries</div><div className="av3-empty-text">Privileged actions are recorded here.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(e) => e.id} />
          )}
        </div>
      )}
    </>
  );
}
