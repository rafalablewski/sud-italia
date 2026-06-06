"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, SkeletonRows, Table } from "./ui";

interface Entry {
  id: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}
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
function isPlainObject(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }

export function AuditLogV3() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Entry | null>(null);
  // Purging the trail is owner-only (the API enforces it; we gate the UI so
  // managers who can read the log never see controls they can't use).
  const [isOwner, setIsOwner] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<"all" | "filtered" | "selected" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/audit-log?limit=500").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setEntries(Array.isArray(res) ? res : []);
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setIsOwner(j?.role === "owner"); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) c[group(e.action)] = (c[group(e.action)] ?? 0) + 1;
    return c;
  }, [entries]);
  const rows = useMemo(() => (filter === "all" ? entries : entries.filter((e) => group(e.action) === filter)), [entries, filter]);
  const chips: Filter[] = ["all", "orders", "menu", "feedback", "settings", "loyalty", "staff", "other"];

  const visibleSelectedCount = useMemo(() => rows.reduce((n, e) => n + (selected.has(e.id) ? 1 : 0), 0), [rows, selected]);
  const toggleSelected = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    const allSelected = rows.length > 0 && rows.every((e) => next.has(e.id));
    for (const e of rows) { if (allSelected) next.delete(e.id); else next.add(e.id); }
    return next;
  });

  const confirmCount = confirmMode === "selected" ? selected.size : confirmMode === "filtered" ? rows.length : entries.length;
  const runDelete = async () => {
    if (!confirmMode) return;
    const payload = confirmMode === "all"
      ? { all: true }
      : { ids: confirmMode === "selected" ? Array.from(selected) : rows.map((e) => e.id) };
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(res.status === 403 ? "Only owners can delete audit entries." : "Could not delete entries.");
        return;
      }
      setSelected(new Set());
      setConfirmMode(null);
      await load();
    } catch {
      setError("Could not delete entries.");
    } finally {
      setDeleting(false);
    }
  };

  const cols: ColumnV3<Entry>[] = [
    ...(isOwner ? [{
      key: "sel",
      header: (
        <input
          type="checkbox"
          checked={rows.length > 0 && visibleSelectedCount === rows.length}
          ref={(el) => { if (el) el.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < rows.length; }}
          onChange={toggleSelectAllVisible}
          onClick={(ev) => ev.stopPropagation()}
          aria-label="Select all shown"
        />
      ),
      render: (e: Entry) => (
        <input
          type="checkbox"
          checked={selected.has(e.id)}
          onChange={() => toggleSelected(e.id)}
          onClick={(ev) => ev.stopPropagation()}
          aria-label="Select audit entry"
        />
      ),
    } as ColumnV3<Entry>] : []),
    { key: "t", header: "When", render: (e) => <span className="av3-cell-muted">{fmt(e.occurredAt)}</span> },
    { key: "actor", header: "Actor", render: (e) => <span style={{ fontWeight: 500 }}>{e.actor}</span> },
    { key: "action", header: "Action", render: (e) => <Badge tone={tone(e.action)}>{e.action}</Badge> },
    { key: "entity", header: "Entity", render: (e) => <span className="av3-cell-muted">{e.entityType ? `${e.entityType}${e.entityId ? ` · ${e.entityId.slice(-8)}` : ""}` : "—"}</span> },
    { key: "diff", header: "", render: (e) => (hasDiff(e) ? <Badge tone="neutral">diff</Badge> : <span className="av3-cell-muted">—</span>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Audit log</h1>
          <div className="av3-pagehead-sub">Every privileged action · last 500 · open a row for the field-by-field diff{isOwner ? " · owners can purge" : ""}</div>
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

      {isOwner && !loading && entries.length > 0 && (
        <div className="av3-card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="av3-cell-muted" style={{ fontSize: 13 }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" disabled={selected.size === 0} onClick={() => { setError(null); setConfirmMode("selected"); }}>
            <Trash2 className="av3-btn-ico" /> Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button variant="secondary" size="sm" disabled={rows.length === 0 || filter === "all"} onClick={() => { setError(null); setConfirmMode("filtered"); }} title={filter === "all" ? "Pick a filter first, or use Delete all" : undefined}>
            <Trash2 className="av3-btn-ico" /> Delete filtered{filter !== "all" ? ` (${rows.length})` : ""}
          </Button>
          <Button variant="danger" size="sm" onClick={() => { setError(null); setConfirmMode("all"); }}>
            <Trash2 className="av3-btn-ico" /> Delete all
          </Button>
        </div>
      )}

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No entries</div><div className="av3-empty-text">Privileged actions are recorded here.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(e) => e.id} onRowClick={setDetail} />
          )}
        </div>
      )}

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.action ?? "Audit entry"}
        subtitle={detail ? `${detail.actor} · ${fmt(detail.occurredAt)}` : undefined}
        headerExtra={detail ? <Badge tone={tone(detail.action)}>{group(detail.action)}</Badge> : undefined}
        width={560}
      >
        {detail && (
          <>
            <div className="av3-od-grid">
              <div className="av3-od-field"><div className="k">Actor</div><div className="v">{detail.actor}</div></div>
              <div className="av3-od-field"><div className="k">When</div><div className="v">{fmt(detail.occurredAt)}</div></div>
              <div className="av3-od-field"><div className="k">Entity</div><div className="v">{detail.entityType ?? "—"}</div></div>
              <div className="av3-od-field"><div className="k">Entity ID</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{detail.entityId ?? "—"}</div></div>
            </div>
            <div className="av3-section-label" style={{ marginBottom: 8 }}>Field-by-field diff</div>
            {hasDiff(detail) ? <DiffRenderer before={detail.before} after={detail.after} /> : <div className="av3-diff-empty">No snapshot recorded for this action (metadata only).</div>}
          </>
        )}
      </Dialog>

      <Dialog
        open={confirmMode !== null}
        onClose={() => { if (!deleting) { setConfirmMode(null); setError(null); } }}
        title={confirmMode === "all"
          ? "Delete the entire audit trail?"
          : `Delete ${confirmCount} ${confirmCount === 1 ? "entry" : "entries"}?`}
        width={460}
        footer={
          <>
            <Button variant="ghost" size="sm" disabled={deleting} onClick={() => { setConfirmMode(null); setError(null); }}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={runDelete}>
              {confirmMode === "all" ? "Delete everything" : `Delete ${confirmCount}`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {confirmMode === "all"
            ? "This permanently removes every audit-log entry, including any not shown here. This cannot be undone. The deletion itself will be recorded as a new entry."
            : "This permanently removes the chosen entries. This cannot be undone. The deletion itself will be recorded as a new entry."}
        </p>
        {error && <p style={{ marginTop: 8, marginBottom: 0, color: "var(--av3-bad)" }}>{error}</p>}
      </Dialog>
    </>
  );
}

function hasDiff(e: Entry) { return e.before !== undefined || e.after !== undefined; }

/**
 * v3-native field-level diff (port of the v2 AuditLog DiffRenderer, restyled to
 * `.av3-diff-*` tokens). Each key is added / removed / changed; objects + arrays
 * render as pretty JSON so nested shapes (Order.refund, Order.dispute) stay legible.
 */
function DiffRenderer({ before, after }: { before: unknown; after: unknown }) {
  const beforeObj = isPlainObject(before) ? before : null;
  const afterObj = isPlainObject(after) ? after : null;

  if (!beforeObj && !afterObj) {
    return (
      <div className="av3-diff-2">
        <DiffBlock label="before" value={before} t="removed" />
        <DiffBlock label="after" value={after} t="added" />
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
    const inB = beforeObj !== null && key in beforeObj;
    const inA = afterObj !== null && key in afterObj;
    if (inB && !inA) rows.push({ key, kind: "removed", before: b, after: undefined });
    else if (!inB && inA) rows.push({ key, kind: "added", before: undefined, after: a });
    else if (JSON.stringify(b) !== JSON.stringify(a)) rows.push({ key, kind: "changed", before: b, after: a });
  }

  if (rows.length === 0) return <div className="av3-diff-empty">No field-level differences (only metadata recorded).</div>;

  return (
    <div className="av3-diff">
      {rows.map((r) => (
        <div className="av3-diff-row" key={r.key}>
          <div className="av3-diff-key">
            {r.kind === "added" && <Plus style={{ color: "var(--av3-ok)" }} />}
            {r.kind === "removed" && <Minus style={{ color: "var(--av3-bad)" }} />}
            {r.kind === "changed" && <span style={{ color: "var(--av3-warn)", fontWeight: 700 }}>~</span>}
            {r.key}
          </div>
          {r.kind === "removed" && <DiffValue value={r.before} t="removed" />}
          {r.kind === "added" && <DiffValue value={r.after} t="added" />}
          {r.kind === "changed" && (
            <div className="av3-diff-2">
              <DiffValue value={r.before} t="removed" />
              <DiffValue value={r.after} t="added" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffBlock({ label, value, t }: { label: string; value: unknown; t: "added" | "removed" }) {
  return (
    <div className="av3-diff-block">
      <div className="av3-diff-block-l">{label}</div>
      <DiffValue value={value} t={t} />
    </div>
  );
}
function DiffValue({ value, t }: { value: unknown; t: "added" | "removed" }) {
  const text = value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="av3-diff-val" data-tone={t}>{text}</pre>;
}
