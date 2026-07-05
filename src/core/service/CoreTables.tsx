"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { useCoreCache } from "@/lib/useCoreCache";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { RefreshIcon, PlusIcon } from "@/core/shell/toolIcons";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { TABLE_FEATURES, type FloorTable, type TableStatus, type TableFeature } from "@/data/types";
import { serviceTabs } from "./serviceTabs";
import { tLabel } from "./tableLabel";

/**
 * Core · Service · Tables — the **table plan**, not the live room. This surface
 * does one job: manage the physical layout — zones, tables and seats. Create,
 * edit and delete tables; set each table's seats, zone, availability and
 * accessibility features. There is **no seating, no order lookup, no live
 * occupancy** here — that operational flow lives in Book (`/core/service/book`,
 * whose Floor lens seats parties and opens checks) and POS. Reads/writes the
 * same per-location table catalogue every other surface shares:
 * `GET/POST/DELETE /api/admin/floor/tables?location=`.
 */

// Management statuses — a config surface sets a table available, reserved, or
// out of service. "seated" is an operational state owned by Book/POS and is
// never *set* here; if a table is already seated the editor keeps that value
// so editing its seats/zone can't accidentally free a party.
const EDIT_STATUSES: TableStatus[] = ["available", "reserved", "out-of-service"];

const FEATURE_LABEL: Record<TableFeature, string> = {
  accessible: "♿ accessible",
  "high-chair": "🍼 high-chair",
  "step-free": "▭ step-free",
};
const FEATURE_GLYPH: Record<TableFeature, string> = {
  accessible: "♿",
  "high-chair": "🍼",
  "step-free": "▭",
};

export function CoreTables() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  // Cached by location so switching pages/tabs re-renders the last floor plan
  // instantly (no loading flash); the poll/mount fetch revalidates it.
  const [tables, setTables] = useCoreCache<FloorTable[] | null>(`core:tables:${loc}`, null);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<FloorTable | "new" | null>(null);
  // A load error is surfaced (with a Retry) rather than swallowed — otherwise a
  // 403 (location scope) / network drop leaves the surface stuck on the loading
  // placeholder forever, indistinguishable from a slow fetch.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`);
      if (!res.ok) {
        setError(res.status === 403 ? "You don't have access to this location's tables." : "Couldn't load tables.");
        return;
      }
      const d = await res.json();
      setError(null);
      setTables(Array.isArray(d) ? d : (d.tables ?? []));
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
  }, [loc, setTables]);
  useEffect(() => { void load(); }, [load]);
  // A gentle poll so a table added on another till appears here — the plan
  // changes rarely, so 20s is plenty (this is config, not the live floor).
  usePolling(load, 20000);

  // Optimistic merge so a created/edited/deleted table reflects instantly
  // instead of blanking until the refetch lands. load() still reconciles after.
  const applyChange = useCallback((change: { table?: FloorTable; deletedId?: string }) => {
    setTables((prev) => {
      if (!prev) return prev;
      if (change.deletedId) return prev.filter((t) => t.id !== change.deletedId);
      if (change.table) {
        const ft = change.table;
        return prev.some((t) => t.id === ft.id)
          ? prev.map((t) => (t.id === ft.id ? ft : t))
          : [...prev, ft];
      }
      return prev;
    });
  }, [setTables]);

  const zones = useMemo(() => {
    const m = new Map<string, FloorTable[]>();
    for (const t of tables ?? []) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [tables]);

  // If the filtered zone stops existing (its last table was re-zoned or
  // deleted), drop the filter — otherwise the zone-tab bar hides at ≤1 zone,
  // the stale filter matches nothing, and the floor strands empty with no
  // in-page way to reset.
  useEffect(() => {
    if (zoneFilter && tables && !zones.some(([z]) => z === zoneFilter)) setZoneFilter(null);
  }, [zoneFilter, zones, tables]);

  // Every figure is derived live from the table catalogue (Rule #1): how many
  // tables, total seats, distinct zones, and how many are available / out of
  // service / carry an accessibility feature.
  const stats = useMemo(() => {
    const list = tables ?? [];
    let seats = 0, available = 0, oos = 0, accessible = 0;
    for (const t of list) {
      seats += t.seats;
      if (t.status === "available") available++;
      if (t.status === "out-of-service") oos++;
      if (t.features && t.features.length) accessible++;
    }
    return { count: list.length, seats, zones: zones.length, available, oos, accessible };
  }, [tables, zones]);

  const statusOf = (s: TableStatus): { cls: string; label: string } => {
    if (s === "out-of-service") return { cls: "oos", label: "out of service" };
    if (s === "reserved") return { cls: "booked", label: "reserved" };
    if (s === "seated") return { cls: "seated", label: "seated" };
    return { cls: "free", label: "available" };
  };

  // ── Zone management: drag a table between zone groups, or rename a zone ────
  // Zones are derived from each table's `zone` field (no separate entity), so
  // moving a table = rewriting its `zone`, and renaming a zone = rewriting the
  // `zone` of every table in it. The label a null/empty zone is grouped under.
  const DEFAULT_ZONE = "Floor";
  const zoneToWrite = (label: string): string | undefined => (label === DEFAULT_ZONE ? undefined : label);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const [renamingZone, setRenamingZone] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  // Persist a table's whole row with `patch`, preserving its LIVE status: the
  // route overwrites the row, and this surface only polls every 20s, so re-read
  // the current status right before writing — a zone move must never clobber a
  // seating transition that happened in Book/POS (same guard as the editor).
  const persistTableZone = async (t: FloorTable, zone: string | undefined): Promise<boolean> => {
    let status = t.status;
    try {
      const cur = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`);
      if (cur.ok) {
        const list = (await cur.json()) as FloorTable[];
        const fresh = (Array.isArray(list) ? list : []).find((x) => x.id === t.id);
        if (fresh) status = fresh.status;
      }
    } catch { /* fall back to the known status */ }
    const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, number: t.number, seats: t.seats, zone: zone || undefined, status, notes: t.notes || undefined, features: t.features ?? [] }),
    });
    return res.ok;
  };

  const reassignZone = async (t: FloorTable, targetLabel: string) => {
    const zone = zoneToWrite(targetLabel);
    if ((t.zone || undefined) === zone) return;
    applyChange({ table: { ...t, zone } }); // optimistic
    const ok = await persistTableZone(t, zone);
    toast(ok ? `${tLabel(t.number)} → ${targetLabel}` : "Could not move table", ok ? "success" : "danger");
    await load();
  };

  const commitRename = async () => {
    const from = renamingZone;
    const to = renameVal.trim();
    setRenamingZone(null);
    if (!from || !to || to === from) return;
    const zone = zoneToWrite(to);
    const inZone = (tables ?? []).filter((t) => (t.zone || DEFAULT_ZONE) === from);
    inZone.forEach((t) => applyChange({ table: { ...t, zone } })); // optimistic
    const results = await Promise.all(inZone.map((t) => persistTableZone(t, zone)));
    const ok = results.every(Boolean);
    toast(ok ? `Zone renamed → ${to}` : "Some tables could not move", ok ? "success" : "danger");
    await load();
  };

  return (
    <CoreShell
      eyebrow="Service · Tables"
      tabs={serviceTabs("tables")}
    >
      <div className="core-guest-inbox">
        {/* Unified ActionBar — identity (Service · Tables) · the Zone scope
            switch (when >1 zone) on the left · actions (Refresh · Add table). */}
        <CoreSurfToolbar
          ariaLabel="Table controls"
          left={
            zones.length > 1 ? (
              /* Zone scope switch — the view/scope toggle. */
              <div className="core-seg" role="tablist" aria-label="Zone">
                <button type="button" role="tab" aria-selected={!zoneFilter} className={!zoneFilter ? "on" : undefined} onClick={() => setZoneFilter(null)}>
                  All zones<span className="c">{zones.reduce((a, [, ts]) => a + ts.length, 0)}</span>
                </button>
                {zones.map(([z, ts]) => (
                  <button key={z} type="button" role="tab" aria-selected={zoneFilter === z} className={zoneFilter === z ? "on" : undefined} onClick={() => setZoneFilter(z)}>
                    {z}<span className="c">{ts.length}</span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
          right={
            <>
              <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
              <button type="button" className="cm-primary" onClick={() => setEditing("new")}><PlusIcon />Add table</button>
            </>
          }
        />

        {/* dense-console stat strip — every figure from the table catalogue
            (Rule #1): Tables · Seats · Zones · Available · Out of service ·
            Accessible. No live occupancy — this is the plan, not the room. */}
        <div className="core-statstrip" role="group" aria-label="Table plan">
          <div className="cell">
            <span className="lab">Tables</span>
            <span className="val info">{tables ? stats.count : "—"}</span>
            <span className="delta">{tables ? `${stats.seats} seats` : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Seats</span>
            <span className="val">{tables ? stats.seats : "—"}</span>
            <span className="delta">{tables && stats.count ? `${Math.round(stats.seats / stats.count)} avg / table` : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Zones</span>
            <span className="val">{tables ? stats.zones : "—"}</span>
            <span className="delta">{zones.length ? zones.map(([z]) => z.toLowerCase()).join(" · ") : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Available</span>
            <span className="val basil">{tables ? stats.available : "—"}</span>
            <span className="delta">{tables ? "ready to seat" : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Out of service</span>
            <span className={stats.oos > 0 ? "val amber" : "val"}>{tables ? stats.oos : "—"}</span>
            <span className="delta">{tables ? (stats.oos > 0 ? "blocked" : "all in service") : ""}</span>
          </div>
          <div className="cell">
            <span className="lab">Accessible</span>
            <span className="val brand">{tables ? stats.accessible : "—"}</span>
            <span className="delta">{tables ? "with features" : ""}</span>
          </div>
        </div>

        <div className="core-floor">
          {!tables && error ? (
            <div className="core-ctx-empty pad">
              {error}{" "}
              <button type="button" className="core-btn ghost sm" onClick={() => void load()}>Retry</button>
            </div>
          ) : !tables ? (
            <div className="core-ctx-empty pad">Loading tables…</div>
          ) : zones.length === 0 ? (
            <div className="core-ctx-empty pad">No tables yet — add one to start building the floor plan.</div>
          ) : (
            // Defensive: if the active filter's zone has vanished, show all
            // zones rather than an empty list (the effect above also clears it).
            (zoneFilter && zones.some(([z]) => z === zoneFilter) ? zones.filter(([z]) => z === zoneFilter) : zones).map(([zone, tbls]) => {
              const zSeats = tbls.reduce((a, t) => a + t.seats, 0);
              const isDrop = dragId != null && dropZone === zone;
              return (
                <div
                  key={zone}
                  className={isDrop ? "core-zone-group drop-target" : "core-zone-group"}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); if (dropZone !== zone) setDropZone(zone); } }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const t = (tables ?? []).find((x) => x.id === dragId);
                    if (t) void reassignZone(t, zone);
                    setDragId(null);
                    setDropZone(null);
                  }}
                >
                  <div className="core-zone-h">
                    {renamingZone === zone ? (
                      <input
                        className="core-zone-rename-inp"
                        value={renameVal}
                        autoFocus
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
                          else if (e.key === "Escape") { e.preventDefault(); setRenamingZone(null); }
                        }}
                        aria-label={`Rename zone ${zone}`}
                      />
                    ) : (
                      <>
                        <span className="zt">{zone}</span>
                        <button
                          type="button"
                          className="core-zone-rename"
                          title="Rename zone"
                          aria-label={`Rename zone ${zone}`}
                          onClick={() => { setRenamingZone(zone); setRenameVal(zone); }}
                        >
                          ✎
                        </button>
                      </>
                    )}
                    <span className="core-cust-sub">{tbls.length} table{tbls.length === 1 ? "" : "s"} · {zSeats} seats</span>
                  </div>
                  <div className="core-tables">
                    {tbls.map((t) => {
                      const st = statusOf(t.status);
                      const feats = t.features ?? [];
                      return (
                        <div key={t.id} className="core-tbl2-wrap">
                          <div
                            role="button"
                            tabIndex={0}
                            draggable
                            className={`core-tbl2 ${st.cls}${dragId === t.id ? " is-dragging" : ""}`}
                            onClick={() => setEditing(t)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(t); } }}
                            onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                            onDragEnd={() => { setDragId(null); setDropZone(null); }}
                            title={`Table ${t.number} — click to edit · drag to move zone`}
                          >
                            <span className="thead">
                              <span className="tnum">{tLabel(t.number)}</span>
                              <span className="tstat"><span className="dot" /><span className="tst">{st.label}</span></span>
                            </span>
                            <span className="tcap">{t.seats} seat{t.seats === 1 ? "" : "s"}</span>
                            <span className="tdwell">
                              {feats.length ? feats.map((f) => FEATURE_GLYPH[f]).join(" · ") : `${t.seats}-top`}
                            </span>
                            {t.notes && <span className="core-tnote-chip" title={t.notes}>📝 {t.notes}</span>}
                          </div>
                          <button
                            type="button"
                            className="core-tbl2-edit"
                            onClick={() => setEditing(t)}
                            title="Edit table"
                            aria-label={`Edit table ${t.number}`}
                          >
                            ⋯
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <TableDialog
        loc={loc}
        table={editing}
        onClose={() => setEditing(null)}
        onSaved={(change) => {
          setEditing(null);
          applyChange(change);
          void load();
        }}
      />
    </CoreShell>
  );
}

function TableDialog({
  loc,
  table,
  onClose,
  onSaved,
}: {
  loc: string;
  table: FloorTable | "new" | null;
  onClose: () => void;
  onSaved: (change: { table?: FloorTable; deletedId?: string }) => void;
}) {
  const toast = useCoreToast();
  const isNew = table === "new";
  const row = table && table !== "new" ? table : null;
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("");
  const [status, setStatus] = useState<TableStatus>("available");
  // Did the manager deliberately change the status field this session? A `save`
  // that doesn't touch status must NOT write the value captured at open — see
  // the note in `save()`.
  const [statusDirty, setStatusDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [features, setFeatures] = useState<TableFeature[]>([]);
  const [busy, setBusy] = useState(false);
  const rowNotes = row?.notes ?? "";
  const rowFeatures = (row?.features ?? []).join(",");

  useEffect(() => {
    if (table) {
      setNumber(row?.number ?? "");
      setSeats(String(row?.seats ?? 4));
      setZone(row?.zone ?? "");
      setStatus(row?.status ?? "available");
      setStatusDirty(false);
      setNotes(rowNotes);
      setFeatures(rowFeatures ? (rowFeatures.split(",") as TableFeature[]) : []);
      setBusy(false);
    }
  }, [table, row, rowNotes, rowFeatures]);
  const toggleFeature = (f: TableFeature) =>
    setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  // If a table is already seated, keep that value selectable so editing its
  // seats/zone can't silently free the party; otherwise offer the three
  // management statuses only — seating happens in Book, not here.
  const statusOptions = EDIT_STATUSES.includes(status) ? EDIT_STATUSES : [status, ...EDIT_STATUSES];

  const save = async () => {
    if (!number.trim() || busy) return;
    setBusy(true);
    try {
      // `saveTable` overwrites the WHOLE row, so a config-only edit (seats,
      // zone, notes…) would blindly re-write whatever status the form captured
      // at open — and this surface polls only every 20s. If the party was
      // seated/freed elsewhere in that window, writing the stale status would
      // re-seat an empty table (or free a live one) and log a bogus floor
      // transition. So when the manager didn't touch status, re-read the
      // table's CURRENT status right before writing; only send the form's value
      // when they explicitly changed it.
      let statusToWrite: TableStatus = status;
      if (!isNew && row && !statusDirty) {
        try {
          const cur = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`);
          if (cur.ok) {
            const list = (await cur.json()) as FloorTable[];
            const fresh = (Array.isArray(list) ? list : []).find((t) => t.id === row.id);
            if (fresh) statusToWrite = fresh.status;
          }
        } catch { /* fall back to the loaded status */ }
      }
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          number: number.trim(),
          seats: Math.max(1, Math.min(50, Math.round(Number(seats) || 1))),
          zone: zone.trim() || undefined,
          status: statusToWrite,
          notes: notes.trim() || undefined,
          features,
        }),
      });
      if (res.ok) {
        const saved = (await res.json().catch(() => null)) as FloorTable | null;
        toast(isNew ? "Table added" : "Table saved", "success");
        onSaved(saved ? { table: saved } : {});
      } else toast("Could not save table", "danger");
    } catch {
      toast("Network error — try again", "danger");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!row || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/floor/tables?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      // The route returns HTTP 200 with `{ ok:false }` when the id no longer
      // exists (already deleted, or wrong location) — so check the body, not
      // just the HTTP status, to avoid a false "deleted" toast + phantom
      // optimistic removal that the next poll snaps back.
      const body = await res.json().catch(() => ({ ok: res.ok }));
      if (res.ok && body?.ok !== false) {
        toast("Table deleted", "success");
        onSaved({ deletedId: row.id });
      } else toast("Could not delete", "danger");
    } catch {
      toast("Network error — try again", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoreDialog
      open={table != null}
      onClose={onClose}
      title={isNew ? "Add table" : `Table ${row?.number}`}
      footer={
        <>
          {row && (
            <button type="button" className="core-btn danger" onClick={() => void del()} disabled={busy} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button type="button" className="core-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="core-btn primary" onClick={() => void save()} disabled={busy || !number.trim()}>
            {isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      <label className="core-tbl-field">
        <span>Number / label</span>
        <input className="core-inp" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12, Bar 3, Patio A" autoFocus />
      </label>
      <label className="core-tbl-field">
        <span>Seats</span>
        <input className="core-inp" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
      </label>
      <label className="core-tbl-field">
        <span>Zone</span>
        <input className="core-inp" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="main, patio, bar" />
      </label>
      <label className="core-tbl-field">
        <span>Status</span>
        <select className="core-inp" value={status} onChange={(e) => { setStatus(e.target.value as TableStatus); setStatusDirty(true); }}>
          {statusOptions.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </label>
      <div className="core-tbl-field">
        <span>Accessibility</span>
        <div className="core-tbl-features">
          {TABLE_FEATURES.map((f) => (
            <button
              key={f}
              type="button"
              className={`core-tbl-feat${features.includes(f) ? " on" : ""}`}
              onClick={() => toggleFeature(f)}
              aria-pressed={features.includes(f)}
            >
              {FEATURE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <label className="core-tbl-field">
        <span>Service note</span>
        <textarea className="core-inp" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="allergy, VIP, high-chair, split bill…" style={{ resize: "vertical", fontFamily: "inherit" }} />
      </label>
    </CoreDialog>
  );
}
