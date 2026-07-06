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

// Status is NOT set here — it's an operational state owned by Book/POS. A new
// table starts "available"; an edit carries the table's live status through
// untouched (see `save()` in TableDialog). This surface only configures the
// physical plan: number, seats, zone, accessibility.

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

// A floor zone — a first-class entity (GET/POST/PATCH/DELETE
// /api/admin/floor/zones), separate from tables, so an empty zone persists.
// Tables still reference a zone by NAME (`FloorTable.zone`).
type Zone = { id: string; name: string; position: number };

export function CoreTables() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  // Cached by location so switching pages/tabs re-renders the last floor plan
  // instantly (no loading flash); the poll/mount fetch revalidates it.
  const [tables, setTables] = useCoreCache<FloorTable[] | null>(`core:tables:${loc}`, null);
  const [zoneList, setZoneList] = useCoreCache<Zone[]>(`core:zones:${loc}`, []);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<FloorTable | "new" | null>(null);
  // A load error is surfaced (with a Retry) rather than swallowed — otherwise a
  // 403 (location scope) / network drop leaves the surface stuck on the loading
  // placeholder forever, indistinguishable from a slow fetch.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tRes, zRes] = await Promise.all([
        fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`),
        fetch(`/api/admin/floor/zones?location=${encodeURIComponent(loc)}`),
      ]);
      if (!tRes.ok) {
        setError(tRes.status === 403 ? "You don't have access to this location's tables." : "Couldn't load tables.");
        return;
      }
      const d = await tRes.json();
      setError(null);
      setTables(Array.isArray(d) ? d : (d.tables ?? []));
      if (zRes.ok) {
        const zd = await zRes.json().catch(() => null);
        if (Array.isArray(zd?.zones)) setZoneList(zd.zones);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
  }, [loc, setTables, setZoneList]);
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

  // Group tables under the ZONE ENTITIES (ordered) — empty zones persist because
  // they're real rows, not derived from tables. Tables whose zone isn't (yet) a
  // managed entity fall into `orphans` (transient — reconcile promotes them on
  // the next load); tables with no zone into `unzoned`.
  const grouped = useMemo(() => {
    const byName = new Map<string, FloorTable[]>();
    for (const z of zoneList) byName.set(z.name, []);
    const orphan = new Map<string, FloorTable[]>();
    const unzoned: FloorTable[] = [];
    for (const t of tables ?? []) {
      const zn = (t.zone ?? "").trim();
      if (!zn) unzoned.push(t);
      else if (byName.has(zn)) byName.get(zn)!.push(t);
      else (orphan.get(zn) ?? orphan.set(zn, []).get(zn)!).push(t);
    }
    return {
      groups: zoneList.map((z) => ({ zone: z, tables: byName.get(z.name) ?? [] })),
      orphans: [...orphan.entries()] as [string, FloorTable[]][],
      unzoned,
    };
  }, [tables, zoneList]);
  // Every managed group's label (entities + any transient orphans).
  const groupNames = useMemo(
    () => [...grouped.groups.map((g) => g.zone.name), ...grouped.orphans.map(([n]) => n)],
    [grouped],
  );

  // If the filtered zone stops existing (deleted / renamed), drop the filter.
  useEffect(() => {
    if (zoneFilter && tables && !groupNames.includes(zoneFilter)) setZoneFilter(null);
  }, [zoneFilter, groupNames, tables]);

  // Live figures from the catalogue (Rule #1); zone count is the entity/managed
  // groups (so an empty zone still counts).
  const stats = useMemo(() => {
    const list = tables ?? [];
    let seats = 0, available = 0, oos = 0, accessible = 0;
    for (const t of list) {
      seats += t.seats;
      if (t.status === "available") available++;
      if (t.status === "out-of-service") oos++;
      if (t.features && t.features.length) accessible++;
    }
    return { count: list.length, seats, zones: groupNames.length, available, oos, accessible };
  }, [tables, groupNames]);

  const statusOf = (s: TableStatus): { cls: string; label: string } => {
    if (s === "out-of-service") return { cls: "oos", label: "out of service" };
    if (s === "reserved") return { cls: "booked", label: "reserved" };
    if (s === "seated") return { cls: "seated", label: "seated" };
    return { cls: "free", label: "available" };
  };

  // ── Zone management ── drag tables between zones, and add / rename / delete
  // ZONES (first-class entities via /api/admin/floor/zones, so an empty zone
  // persists). A table references its zone by NAME: moving rewrites `table.zone`;
  // renaming/deleting act on the entity (the API cascades / frees member tables).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null); // group key hovered while dragging
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [zoneBusy, setZoneBusy] = useState(false);
  const UNZONED = "__unzoned__";

  // Persist a table's whole row with a new zone, preserving its LIVE status
  // (re-read right before writing so a move can't clobber a seating transition
  // that happened in Book/POS — the same guard the editor uses).
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

  // Move a table into a zone (`targetName` = the zone's name, or "" for unzoned).
  const reassignZone = async (t: FloorTable, targetName: string) => {
    const zone = targetName || undefined;
    if ((t.zone || undefined) === zone) return;
    applyChange({ table: { ...t, zone } }); // optimistic
    const ok = await persistTableZone(t, zone);
    toast(ok ? `${tLabel(t.number)} → ${targetName || "Unzoned"}` : "Could not move table", ok ? "success" : "danger");
    await load();
  };

  const addZone = async () => {
    if (zoneBusy) return;
    setZoneBusy(true);
    try {
      const res = await fetch(`/api/admin/floor/zones?location=${encodeURIComponent(loc)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "New zone" }),
      });
      if (res.ok) {
        const z = (await res.json().catch(() => null)) as Zone | null;
        if (z) { setZoneList((prev) => [...prev, z]); setRenamingId(z.id); setRenameVal(z.name); } // jump straight into naming it
        await load();
      } else toast("Could not add zone", "danger");
    } finally { setZoneBusy(false); }
  };

  const commitRename = async () => {
    const id = renamingId;
    const name = renameVal.trim();
    setRenamingId(null);
    const zone = zoneList.find((z) => z.id === id);
    if (!id || !zone || !name || name === zone.name) return;
    setZoneList((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z))); // optimistic
    const res = await fetch(`/api/admin/floor/zones?location=${encodeURIComponent(loc)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || "Could not rename zone", "danger"); }
    await load();
  };

  const removeZone = async (zone: Zone, count: number) => {
    if (zoneBusy) return;
    if (count > 0 && !window.confirm(`Delete “${zone.name}”? Its ${count} table${count === 1 ? "" : "s"} will become unzoned.`)) return;
    setZoneBusy(true);
    setZoneList((prev) => prev.filter((z) => z.id !== zone.id)); // optimistic
    try {
      const res = await fetch(`/api/admin/floor/zones?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(zone.id)}`, { method: "DELETE" });
      toast(res.ok ? `Zone “${zone.name}” deleted` : "Could not delete zone", res.ok ? "success" : "danger");
      await load();
    } finally { setZoneBusy(false); }
  };

  const renderTile = (t: FloorTable) => {
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
          onDragEnd={() => { setDragId(null); setDropKey(null); }}
          title={`Table ${t.number} — click to edit · drag to move zone`}
        >
          <span className="thead">
            <span className="tnum">{tLabel(t.number)}</span>
            <span className="tstat"><span className="dot" /><span className="tst">{st.label}</span></span>
          </span>
          <span className="tcap">{t.seats} seat{t.seats === 1 ? "" : "s"}</span>
          <span className="tdwell">{feats.length ? feats.map((f) => FEATURE_GLYPH[f]).join(" · ") : `${t.seats}-top`}</span>
          {t.notes && <span className="core-tnote-chip" title={t.notes}>📝 {t.notes}</span>}
        </div>
        <button type="button" className="core-tbl2-edit" onClick={() => setEditing(t)} title="Edit table" aria-label={`Edit table ${t.number}`}>⋯</button>
      </div>
    );
  };

  // One zone group: a drop target (its label used as the write value) with an
  // optional rename/delete tool cluster when it's a managed entity.
  const renderGroup = (key: string, label: string, tbls: FloorTable[], entity?: Zone) => {
    const zSeats = tbls.reduce((a, t) => a + t.seats, 0);
    const dropName = entity ? entity.name : key === UNZONED ? "" : label;
    const isDrop = dragId != null && dropKey === key;
    return (
      <div
        key={key}
        className={isDrop ? "core-zone-group drop-target" : "core-zone-group"}
        onDragOver={(e) => { if (dragId) { e.preventDefault(); if (dropKey !== key) setDropKey(key); } }}
        onDrop={(e) => {
          e.preventDefault();
          const t = (tables ?? []).find((x) => x.id === dragId);
          if (t) void reassignZone(t, dropName);
          setDragId(null);
          setDropKey(null);
        }}
      >
        <div className="core-zone-h">
          {entity && renamingId === entity.id ? (
            <input
              className="core-zone-rename-inp"
              value={renameVal}
              autoFocus
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
                else if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
              }}
              aria-label={`Rename zone ${label}`}
            />
          ) : (
            <>
              <span className="zt">{label}</span>
              {entity && (
                <span className="core-zone-tools">
                  <button type="button" className="core-zone-tool" title="Rename zone" aria-label={`Rename zone ${label}`} onClick={() => { setRenamingId(entity.id); setRenameVal(entity.name); }}>✎</button>
                  <button type="button" className="core-zone-tool del" title="Delete zone" aria-label={`Delete zone ${label}`} onClick={() => void removeZone(entity, tbls.length)}>×</button>
                </span>
              )}
            </>
          )}
          <span className="core-cust-sub">{tbls.length} table{tbls.length === 1 ? "" : "s"} · {zSeats} seats</span>
        </div>
        <div className="core-tables">
          {tbls.length ? tbls.map(renderTile) : <div className="core-zone-empty">Drop a table here</div>}
        </div>
      </div>
    );
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
            groupNames.length > 1 ? (
              /* Zone scope switch — the view/scope toggle across managed zones. */
              <div className="core-seg" role="tablist" aria-label="Zone">
                <button type="button" role="tab" aria-selected={!zoneFilter} className={!zoneFilter ? "on" : undefined} onClick={() => setZoneFilter(null)}>
                  All zones<span className="c">{stats.count}</span>
                </button>
                {groupNames.map((z) => {
                  const n = (tables ?? []).filter((t) => (t.zone ?? "").trim() === z).length;
                  return (
                    <button key={z} type="button" role="tab" aria-selected={zoneFilter === z} className={zoneFilter === z ? "on" : undefined} onClick={() => setZoneFilter(z)}>
                      {z}<span className="c">{n}</span>
                    </button>
                  );
                })}
              </div>
            ) : undefined
          }
          right={
            <>
              <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
              <button type="button" className="core-btn ghost" onClick={() => void addZone()} disabled={zoneBusy}><PlusIcon />Add zone</button>
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
            <span className="delta">{groupNames.length ? groupNames.map((z) => z.toLowerCase()).join(" · ") : ""}</span>
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
          ) : grouped.groups.length === 0 && grouped.orphans.length === 0 && grouped.unzoned.length === 0 ? (
            <div className="core-ctx-empty pad">
              No zones yet — add a zone (or a table) to start building the floor plan.{" "}
              <button type="button" className="core-btn ghost sm" onClick={() => void addZone()} disabled={zoneBusy}>Add zone</button>
            </div>
          ) : (
            <>
              {/* Managed zone entities (ordered) — an empty zone renders as an
                  empty drop target so it persists visibly. Filter, when set,
                  narrows to a single named group/orphan; unzoned hides under a
                  filter since it has no name to match. */}
              {grouped.groups
                .filter((g) => !zoneFilter || g.zone.name === zoneFilter)
                .map((g) => renderGroup(g.zone.id, g.zone.name, g.tables, g.zone))}
              {grouped.orphans
                .filter(([name]) => !zoneFilter || name === zoneFilter)
                .map(([name, tbls]) => renderGroup(`o:${name}`, name, tbls))}
              {!zoneFilter && grouped.unzoned.length > 0 && renderGroup(UNZONED, "Unzoned", grouped.unzoned)}
            </>
          )}
        </div>
      </div>

      <TableDialog
        loc={loc}
        table={editing}
        zones={groupNames}
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
  zones,
  onClose,
  onSaved,
}: {
  loc: string;
  table: FloorTable | "new" | null;
  zones: string[];
  onClose: () => void;
  onSaved: (change: { table?: FloorTable; deletedId?: string }) => void;
}) {
  const toast = useCoreToast();
  const isNew = table === "new";
  const row = table && table !== "new" ? table : null;
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("");
  const [features, setFeatures] = useState<TableFeature[]>([]);
  const [busy, setBusy] = useState(false);
  const rowFeatures = (row?.features ?? []).join(",");

  useEffect(() => {
    if (table) {
      setNumber(row?.number ?? "");
      setSeats(String(row?.seats ?? 4));
      setZone(row?.zone ?? "");
      setFeatures(rowFeatures ? (rowFeatures.split(",") as TableFeature[]) : []);
      setBusy(false);
    }
  }, [table, row, rowFeatures]);
  const toggleFeature = (f: TableFeature) =>
    setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  // Zone is picked from the zones that already exist (create a new zone from the
  // board's "Add zone"); if the row's current zone isn't in that list — a
  // freshly-typed legacy value not yet reconciled — keep it selectable so an
  // edit never silently moves the table off it.
  const zoneOptions = zone && !zones.includes(zone) ? [zone, ...zones] : zones;

  const save = async () => {
    if (!number.trim() || busy) return;
    setBusy(true);
    try {
      // This surface only configures the physical plan (number, seats, zone,
      // accessibility) — status and the service note are OPERATIONAL and owned
      // by Book/POS, so they are never edited here. `saveTable` overwrites the
      // WHOLE row, so we must carry the live status + existing note through
      // untouched: re-read the CURRENT status right before writing (this surface
      // polls only every 20s, so the captured value could be stale and re-seat
      // an empty table / free a live one), and preserve the row's note verbatim.
      let statusToWrite: TableStatus = "available";
      let noteToKeep: string | undefined = undefined;
      if (!isNew && row) {
        statusToWrite = row.status;
        noteToKeep = row.notes;
        try {
          const cur = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`);
          if (cur.ok) {
            const list = (await cur.json()) as FloorTable[];
            const fresh = (Array.isArray(list) ? list : []).find((t) => t.id === row.id);
            if (fresh) { statusToWrite = fresh.status; noteToKeep = fresh.notes; }
          }
        } catch { /* fall back to the loaded row */ }
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
          notes: noteToKeep || undefined,
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
        <select className="core-inp" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">— No zone —</option>
          {zoneOptions.map((z) => (
            <option key={z} value={z}>{z}</option>
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
    </CoreDialog>
  );
}
