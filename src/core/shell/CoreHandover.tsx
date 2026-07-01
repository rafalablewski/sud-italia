"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@/shared/LocationContext";

/**
 * Core shift handover — the one-tap snapshot the next server needs, pre-filled
 * from live state (Floor Twin + kitchen pressure + the comp cap), opened from
 * the ⌘K palette ("Shift handover"). Read-only context, not a duplicate form:
 * the formal, persisted sign-off (cash count, temp checks) stays in the
 * manager handover at /admin/handover, one tap away.
 */
interface Twin { summary?: { seated: number; openTables: number; occupancyPct: number; freeingSoon15: number } }
interface Pressure { onLine: number; atRisk: number; oldestSec: number }
interface Comp { compTodayGrosze: number; capGrosze: number }

export function CoreHandover() {
  const { location } = useLocation();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<Element | null>(null);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [press, setPress] = useState<Pressure | null>(null);
  const [comp, setComp] = useState<Comp | null>(null);

  useEffect(() => { setRoot(document.getElementById("admin-portal-root")); }, []);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("core:handover", onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("core:handover", onOpen); window.removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => {
    if (!open || !location) return;
    const l = encodeURIComponent(location);
    fetch(`/api/admin/floor-twin?location=${l}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setTwin(d.twin ?? d)).catch(() => {});
    fetch(`/api/admin/pos/pressure?location=${l}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPress(d)).catch(() => {});
    fetch(`/api/admin/pos/comp-status?location=${l}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setComp(d)).catch(() => {});
  }, [open, location]);

  if (!open || !root) return null;
  const zl = (g?: number) => (g == null ? "—" : `${Math.round(g / 100)} zł`);
  const mins = press ? Math.floor(press.oldestSec / 60) : 0;
  return createPortal(
    <div className="core-cmdk-scrim" onClick={() => setOpen(false)}>
      <div className="core-handover" onClick={(e) => e.stopPropagation()}>
        <div className="core-handover-h"><b>Shift handover</b><span>live snapshot · {location || "all"}</span></div>
        <div className="core-handover-grid">
          <div className="hstat"><div className="hl">Seated / open</div><div className="hv">{twin?.summary?.seated ?? "—"} / {twin?.summary?.openTables ?? "—"}</div></div>
          <div className="hstat"><div className="hl">Occupancy</div><div className="hv">{twin?.summary?.occupancyPct ?? "—"}%</div></div>
          <div className={`hstat${press && press.atRisk > 0 ? " warn" : ""}`}><div className="hl">At risk / on line</div><div className="hv">{press?.atRisk ?? "—"} / {press?.onLine ?? "—"}</div></div>
          <div className="hstat"><div className="hl">Oldest ticket</div><div className="hv">{mins ? `${mins}m` : "—"}</div></div>
          <div className="hstat"><div className="hl">Comps this shift</div><div className="hv">{zl(comp?.compTodayGrosze)} / {zl(comp?.capGrosze)}</div></div>
          <div className="hstat"><div className="hl">Freeing ≤15m</div><div className="hv">{twin?.summary?.freeingSoon15 ?? "—"}</div></div>
        </div>
        <p className="core-handover-note">Pre-filled from the live Twin — the context the next server needs. Cash count + sign-off record in the manager handover.</p>
        <div className="core-handover-foot">
          <button type="button" className="core-btn ghost" onClick={() => setOpen(false)}>Close</button>
          <a className="core-btn primary" href="/admin/handover">Record formal handover →</a>
        </div>
      </div>
    </div>,
    root,
  );
}
