"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import {
  BottomSheet,
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}

type ActionFilter = "all" | "orders" | "menu" | "feedback" | "settings" | "loyalty" | "staff" | "other";

function actionGroup(action: string): ActionFilter {
  const a = action.toLowerCase();
  if (a.includes("order") || a.includes("refund")) return "orders";
  if (a.includes("menu") || a.includes("recipe")) return "menu";
  if (a.includes("feedback")) return "feedback";
  if (a.includes("setting")) return "settings";
  if (a.includes("loyalty") || a.includes("wallet")) return "loyalty";
  if (a.includes("staff") || a.includes("shift")) return "staff";
  return "other";
}

const FILTERS: ActionFilter[] = ["all", "orders", "menu", "feedback", "settings", "loyalty", "staff", "other"];

/**
 * Audit log on mobile. Virtualized list (audit log grows unbounded);
 * tap a row to open a sheet with the formatted before/after JSON diff.
 */
export function MobileAuditLog() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/audit-log?limit=500");
    if (!r.ok) return;
    const data = await r.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => actionGroup(r.action) === filter)),
    [rows, filter],
  );

  const items: MobileListItem<AuditLogEntry>[] = filtered.map((r) => ({
    id: r.id,
    data: r,
    icon: History,
    iconTone: "neutral",
    title: r.action,
    subtitle: `${r.actor}${r.entityType ? ` · ${r.entityType}` : ""}${r.entityId ? ` #${r.entityId.slice(-6)}` : ""}`,
    trailing: new Date(r.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    onTap: () => setDetail(r),
  }));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Filter by action">
            {FILTERS.map((f) => (
              <Chip
                key={f}
                label={f === "all" ? "All" : f}
                active={filter === f}
                onClick={() => setFilter(f)}
                count={f === "all" ? rows.length : rows.filter((r) => actionGroup(r.action) === f).length}
              />
            ))}
          </ChipStrip>
        }
      >
        <PageHeader title="Audit log" subtitle={`${filtered.length} entries`} />
        <MobileList
          items={items}
          virtualizeAt={64}
          empty={<div className="v2-m-empty"><div className="v2-m-empty-title">No audit entries</div></div>}
        />
      </MobilePage>

      <BottomSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.action : ""}
        size="full"
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
              {detail.actor} · {new Date(detail.occurredAt).toLocaleString()}
              {detail.entityType ? ` · ${detail.entityType}` : ""}
              {detail.entityId ? ` · ${detail.entityId}` : ""}
            </div>
            <DiffBlock label="Before" payload={detail.before} />
            <DiffBlock label="After" payload={detail.after} />
          </div>
        )}
      </BottomSheet>
    </PullToRefresh>
  );
}

function DiffBlock({ label, payload }: { label: string; payload: unknown }) {
  if (payload === undefined || payload === null) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
        {label}: <span style={{ fontStyle: "italic" }}>none</span>
      </div>
    );
  }
  const json = (() => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  })();
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--fg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 240,
          overflow: "auto",
        }}
      >
        {json}
      </pre>
    </div>
  );
}
