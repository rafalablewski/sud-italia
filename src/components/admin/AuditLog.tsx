"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Minus, Plus, RefreshCw, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileAuditLog = dynamic(
  () => import("./mobile/MobileAuditLog").then((m) => m.MobileAuditLog),
  { ssr: false },
);
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  Tabs,
} from "./v2/ui";

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
  if (action.startsWith("orders.")) return "orders";
  if (action.startsWith("menu.")) return "menu";
  if (action.startsWith("feedback.")) return "feedback";
  if (action.startsWith("settings.")) return "settings";
  if (action.startsWith("loyalty.") || action.startsWith("points.")) return "loyalty";
  if (action.startsWith("staff.") || action.startsWith("shifts.")) return "staff";
  return "other";
}

function actionTone(action: string): "danger" | "warning" | "success" | "info" | "neutral" {
  if (action.includes("delete") || action.includes("refund_full") || action.includes("dispute")) return "danger";
  if (action.includes("refund") || action.includes("cancel") || action.includes("86")) return "warning";
  if (action.includes("create") || action.includes("available") || action.includes("recall")) return "success";
  if (action.includes("update") || action.includes("status_change") || action.includes("override")) return "info";
  return "neutral";
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditLog() {
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileAuditLog />;
  }
  return <AuditLogDesktop />;
}

function AuditLogDesktop() {
  const toast = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/audit-log?limit=500");
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } else {
        toast.error("Could not load audit log");
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const counts = useMemo(() => {
    const c: Record<ActionFilter, number> = {
      all: entries.length,
      orders: 0,
      menu: 0,
      feedback: 0,
      settings: 0,
      loyalty: 0,
      staff: 0,
      other: 0,
    };
    for (const e of entries) c[actionGroup(e.action)]++;
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (actionFilter !== "all" && actionGroup(e.action) !== actionFilter) return false;
      if (!q) return true;
      return (
        e.action.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        (e.entityId || "").toLowerCase().includes(q) ||
        (e.entityType || "").toLowerCase().includes(q)
      );
    });
  }, [entries, actionFilter, query]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Audit log</h1>
          <p className="v2-page-subtitle">
            Every mutation across the admin surface. Expand a row to see the field-by-field diff.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={fetchEntries}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by actor, action, entity id…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={actionFilter}
          onChange={(v) => setActionFilter(v as ActionFilter)}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "orders", label: "Orders", count: counts.orders },
            { value: "menu", label: "Menu", count: counts.menu },
            { value: "feedback", label: "Feedback", count: counts.feedback },
            { value: "settings", label: "Settings", count: counts.settings },
            { value: "loyalty", label: "Loyalty", count: counts.loyalty },
            { value: "staff", label: "Staff", count: counts.staff },
            { value: "other", label: "Other", count: counts.other },
          ]}
          variant="pill"
          ariaLabel="Action filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading audit log…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={History}
              title={entries.length === 0 ? "No audit entries yet" : "No matches"}
              description={
                entries.length === 0
                  ? "Every admin mutation writes an audit row. Entries appear here as soon as one is recorded."
                  : "Try clearing the filters."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", margin: 0, padding: 0, listStyle: "none" }}>
              {filtered.map((e) => {
                const isOpen = expanded.has(e.id);
                const hasDiff = e.before !== undefined || e.after !== undefined;
                return (
                  <li
                    key={e.id}
                    style={{
                      borderTop: "1px solid var(--border)",
                      padding: "0.75rem 1rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => hasDiff && toggleExpanded(e.id)}
                      disabled={!hasDiff}
                      aria-expanded={isOpen}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        width: "100%",
                        background: "transparent",
                        border: 0,
                        padding: 0,
                        textAlign: "left",
                        cursor: hasDiff ? "pointer" : "default",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <Badge tone={actionTone(e.action)} variant="soft">
                            {e.action}
                          </Badge>
                          {e.entityType && (
                            <span className="v2-muted mono" style={{ fontSize: "0.8125rem" }}>
                              {e.entityType}
                              {e.entityId ? ` · ${e.entityId.slice(-12)}` : ""}
                            </span>
                          )}
                        </div>
                        <span className="v2-muted" style={{ fontSize: "0.75rem" }}>
                          by {e.actor} · {fmtTime(e.occurredAt)}
                        </span>
                      </div>
                      {hasDiff && (
                        <span className="v2-muted" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {isOpen ? "Hide diff" : "Show diff"}
                        </span>
                      )}
                    </button>
                    {isOpen && hasDiff && <DiffRenderer before={e.before} after={e.after} />}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * Renders a key-by-key diff between two snapshot objects from an audit
 * entry. Each key is one of:
 *   - added (in after, not in before)
 *   - removed (in before, not in after)
 *   - changed (both, different values)
 * Primitive non-objects are rendered as single rows; objects/arrays as
 * pretty JSON so nested shapes (Order.refund, Order.dispute) stay readable
 * without writing a recursive diff just for the audit panel.
 */
function DiffRenderer({ before, after }: { before: unknown; after: unknown }) {
  const beforeObj = isPlainObject(before) ? before : null;
  const afterObj = isPlainObject(after) ? after : null;

  // Primitive or array case — render side-by-side.
  if (!beforeObj && !afterObj) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
        <DiffBlock label="before" value={before} tone="removed" />
        <DiffBlock label="after" value={after} tone="added" />
      </div>
    );
  }

  const keys = new Set<string>();
  if (beforeObj) for (const k of Object.keys(beforeObj)) keys.add(k);
  if (afterObj) for (const k of Object.keys(afterObj)) keys.add(k);

  const rows: { key: string; kind: "added" | "removed" | "changed"; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    const b = beforeObj?.[key];
    const a = afterObj?.[key];
    const inBefore = beforeObj !== null && key in beforeObj;
    const inAfter = afterObj !== null && key in afterObj;
    if (inBefore && !inAfter) rows.push({ key, kind: "removed", before: b, after: undefined });
    else if (!inBefore && inAfter) rows.push({ key, kind: "added", before: undefined, after: a });
    else if (JSON.stringify(b) !== JSON.stringify(a)) rows.push({ key, kind: "changed", before: b, after: a });
  }

  if (rows.length === 0) {
    return (
      <div className="v2-muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
        No field-level differences (only metadata recorded).
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "0.5rem",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "0.5rem 0.75rem",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: "0.8125rem",
      }}
    >
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: "0.125rem", padding: "0.25rem 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {r.kind === "added" && <Plus className="h-3 w-3" style={{ color: "var(--success)" }} />}
            {r.kind === "removed" && <Minus className="h-3 w-3" style={{ color: "var(--danger)" }} />}
            {r.kind === "changed" && <span style={{ color: "var(--warning)", fontWeight: 600 }}>~</span>}
            <span style={{ fontWeight: 600 }}>{r.key}</span>
          </div>
          {r.kind === "removed" && <DiffValue value={r.before} tone="removed" />}
          {r.kind === "added" && <DiffValue value={r.after} tone="added" />}
          {r.kind === "changed" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <DiffValue value={r.before} tone="removed" />
              <DiffValue value={r.after} tone="added" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffBlock({ label, value, tone }: { label: string; value: unknown; tone: "added" | "removed" }) {
  return (
    <div
      style={{
        background: tone === "added" ? "var(--success-soft)" : "var(--danger-soft)",
        border: "1px solid var(--border)",
        borderRadius: "0.375rem",
        padding: "0.5rem 0.75rem",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: "0.8125rem",
      }}
    >
      <div className="v2-muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <DiffValue value={value} tone={tone} />
    </div>
  );
}

function DiffValue({ value, tone }: { value: unknown; tone: "added" | "removed" }) {
  const text = value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color:
          tone === "added"
            ? "var(--success)"
            : "var(--danger)",
      }}
    >
      {text}
    </pre>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
