"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  PageHero,
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
  return <AuditLogDesktop />;
}

function AuditLogDesktop() {
  const toast = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Deleting the trail is owner-only (the API enforces it; we gate the UI so
  // managers who can read the log never see controls they can't use).
  const [isOwner, setIsOwner] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<"all" | "filtered" | "selected" | null>(null);

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        if (res.ok && alive) {
          const me = await res.json();
          setIsOwner(me?.role === "owner");
        }
      } catch {
        // Non-owner / unauthenticated — leave the delete controls hidden.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    return entries.filter((e) => {
      if (actionFilter !== "all" && actionGroup(e.action) !== actionFilter) return false;
      return true;
    });
  }, [entries, actionFilter]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // How many of the currently-visible rows are selected — drives the
  // select-all checkbox's checked/indeterminate state.
  const visibleSelectedCount = useMemo(
    () => filtered.reduce((n, e) => n + (selected.has(e.id) ? 1 : 0), 0),
    [filtered, selected],
  );

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = filtered.length > 0 && filtered.every((e) => next.has(e.id));
      if (allVisibleSelected) {
        for (const e of filtered) next.delete(e.id);
      } else {
        for (const e of filtered) next.add(e.id);
      }
      return next;
    });
  };

  // Resolve the confirm dialog's mode into the request payload + copy.
  const confirmCount =
    confirmMode === "selected"
      ? selected.size
      : confirmMode === "filtered"
        ? filtered.length
        : entries.length;

  const runDelete = async (): Promise<boolean> => {
    if (!confirmMode) return false;
    const payload =
      confirmMode === "all"
        ? { all: true }
        : {
            ids:
              confirmMode === "selected"
                ? Array.from(selected)
                : filtered.map((e) => e.id),
          };
    try {
      const res = await fetch("/api/admin/audit-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? "Only owners can delete audit entries"
            : "Could not delete entries",
        );
        return false;
      }
      const data = await res.json().catch(() => ({ deleted: 0 }));
      const n = Number(data?.deleted ?? 0);
      toast.success(`Deleted ${n} ${n === 1 ? "entry" : "entries"}`);
      setSelected(new Set());
      await fetchEntries();
      return true;
    } catch {
      toast.error("Could not delete entries");
      return false;
    }
  };

  return (
    <div className="v2-page">
      <PageHero
        title="Audit log"
        subtitle="Every mutation across the admin surface. Expand a row to see the field-by-field diff."
        actions={
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={fetchEntries}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
          />
        }
        filter={{
          value: actionFilter,
          onChange: (v) => setActionFilter(v as ActionFilter),
          ariaLabel: "Action filter",
          options: [
            { value: "all", label: "All", count: counts.all },
            { value: "orders", label: "Orders", count: counts.orders },
            { value: "menu", label: "Menu", count: counts.menu },
            { value: "feedback", label: "Feedback", count: counts.feedback },
            { value: "settings", label: "Settings", count: counts.settings },
            { value: "loyalty", label: "Loyalty", count: counts.loyalty },
            { value: "staff", label: "Staff", count: counts.staff },
            { value: "other", label: "Other", count: counts.other },
          ],
        }}
      />

      {isOwner && !loading && entries.length > 0 && (
        <Card>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.8125rem" }}>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-ok: tri-state multi-select checkbox; v2/ui has no Checkbox primitive (Switch is a toggle) */}
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && visibleSelectedCount === filtered.length}
                  ref={(el) => {
                    if (el) el.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < filtered.length;
                  }}
                  onChange={toggleSelectAllVisible}
                  style={{ cursor: "pointer" }}
                />
                Select all shown
              </label>
              <span className="v2-muted" style={{ fontSize: "0.8125rem" }}>
                {selected.size} selected
              </span>
              <div style={{ flex: 1 }} />
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmMode("selected")}
                disabled={selected.size === 0}
              >
                {`Delete selected${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmMode("filtered")}
                disabled={filtered.length === 0 || actionFilter === "all"}
                title={
                  actionFilter === "all"
                    ? "Pick an action filter first, or use Delete all"
                    : undefined
                }
              >
                {`Delete filtered${actionFilter !== "all" ? ` (${filtered.length})` : ""}`}
              </Button>
              <Button
                variant="danger"
                size="sm"
                leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmMode("all")}
              >
                Delete all
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="v2-page-loading">Loading Audit log…</div>
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
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    {isOwner && (
                      // eslint-disable-next-line no-restricted-syntax -- ds-ok: per-row multi-select checkbox; v2/ui has no Checkbox primitive (Switch is a toggle)
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleSelected(e.id)}
                        aria-label="Select audit entry"
                        style={{ marginTop: "0.25rem", flexShrink: 0, cursor: "pointer" }}
                      />
                    )}
                    {/* eslint-disable-next-line no-restricted-syntax -- ds-ok: expandable diff row (card-as-button), not an action button */}
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
                        flex: 1,
                        minWidth: 0,
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
                    </div>
                    {isOpen && hasDiff && <DiffRenderer before={e.before} after={e.after} />}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmMode !== null}
        onClose={() => setConfirmMode(null)}
        onConfirm={runDelete}
        destructive
        confirmLabel={
          confirmMode === "all"
            ? "Delete everything"
            : `Delete ${confirmCount} ${confirmCount === 1 ? "entry" : "entries"}`
        }
        title={
          confirmMode === "all"
            ? "Delete the entire audit trail?"
            : confirmMode === "filtered"
              ? `Delete ${confirmCount} filtered ${confirmCount === 1 ? "entry" : "entries"}?`
              : `Delete ${confirmCount} selected ${confirmCount === 1 ? "entry" : "entries"}?`
        }
        description={
          confirmMode === "all"
            ? "This permanently removes every audit-log entry, including any not shown here. This cannot be undone. The deletion itself will be recorded as a new entry."
            : "This permanently removes the chosen entries. This cannot be undone. The deletion itself will be recorded as a new entry."
        }
      />
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
