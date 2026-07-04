"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { CoreShell } from "@/core/shell/CoreShell";
import { RefreshIcon, PlusIcon } from "@/core/shell/toolIcons";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { TABLE_FEATURES, type FloorTable, type TableStatus, type TableFeature } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

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
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [tables, setTables] = useState<FloorTable[] | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<FloorTable | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setTables(Array.isArray(d) ? d : (d.tables ?? []));
    } catch {
      /* non-fatal */
    }
  }, [loc]);
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
  }, []);

  const zones = useMemo(() => {
    const m = new Map<string, FloorTable[]>();
    for (const t of tables ?? []) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [tables]);

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

  return (
    <CoreShell
      eyebrow="Service · Tables"
      tabs={serviceTabs("tables")}
      subRight={
        <>
          <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
          <button type="button" className="cm-primary" onClick={() => setEditing("new")}><PlusIcon />Add table</button>
        </>
      }
    >
      <div className="core-guest-inbox">
        <div className="core-crumb">
          CORE — SERVICE · TABLES · <b>liquid glass</b> · <span className="fix">{location} · dine-in</span>
        </div>
        <div className="core-sectionhead">
          <h1>Service · Tables</h1>
          <span className="sub">
            {tables ? `${stats.count} table${stats.count === 1 ? "" : "s"} · ${stats.seats} seats` : "table plan"}
            {zones.length ? ` · ${zones.map(([z]) => z.toLowerCase()).join(" + ")}` : ""}
          </span>
        </div>

        {/* Zone selector — filters the zoned tile groups. */}
        {zones.length > 1 && (
          <div className="core-zonetabs">
            <span className="core-zone-lbl">Zone</span>
            <button type="button" className={!zoneFilter ? "core-ztab on" : "core-ztab"} onClick={() => setZoneFilter(null)}>
              All zones<span className="n">{zones.reduce((a, [, ts]) => a + ts.length, 0)}</span>
            </button>
            {zones.map(([z, ts]) => (
              <button key={z} type="button" className={zoneFilter === z ? "core-ztab on" : "core-ztab"} onClick={() => setZoneFilter(z)}>
                {z}<span className="n">{ts.length}</span>
              </button>
            ))}
          </div>
        )}

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
          {!tables ? (
            <div className="core-ctx-empty pad">Loading tables…</div>
          ) : zones.length === 0 ? (
            <div className="core-ctx-empty pad">No tables yet — add one to start building the floor plan.</div>
          ) : (
            (zoneFilter ? zones.filter(([z]) => z === zoneFilter) : zones).map(([zone, tbls]) => {
              const zSeats = tbls.reduce((a, t) => a + t.seats, 0);
              return (
                <div key={zone}>
                  <div className="core-zone-h">
                    <span className="zt">{zone}</span>
                    <span className="core-cust-sub">{tbls.length} table{tbls.length === 1 ? "" : "s"} · {zSeats} seats</span>
                  </div>
                  <div className="core-tables">
                    {tbls.map((t) => {
                      const st = statusOf(t.status);
                      const numLabel = /^\d+$/.test(t.number) ? `T${t.number}` : t.number;
                      const feats = t.features ?? [];
                      return (
                        <div key={t.id} className="core-tbl2-wrap">
                          <div
                            role="button"
                            tabIndex={0}
                            className={`core-tbl2 ${st.cls}`}
                            onClick={() => setEditing(t)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(t); } }}
                            title={`Table ${t.number} — edit`}
                          >
                            <span className="thead">
                              <span className="tnum">{numLabel}</span>
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
        featureLabel={FEATURE_LABEL}
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
  featureLabel,
  onClose,
  onSaved,
}: {
  loc: string;
  table: FloorTable | "new" | null;
  featureLabel: Record<TableFeature, string>;
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
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          number: number.trim(),
          seats: Math.max(1, Math.min(50, Math.round(Number(seats) || 1))),
          zone: zone.trim() || undefined,
          status,
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
      if (res.ok) {
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
        <select className="core-inp" value={status} onChange={(e) => setStatus(e.target.value as TableStatus)}>
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
              {featureLabel[f]}
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
