"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/shared/LocationContext";

/**
 * PressureBadge — the Command Bar's live load indicator (the one place global
 * state lives, visible on every lens). Polls the shared kitchen pressure
 * (`/api/admin/pos/pressure` → the same predictive tier the KDS colours from)
 * and pulses on warn/risk so a server feels the room heat without opening a
 * dashboard. Hidden when the line is empty.
 */
interface Pressure {
  tier: "calm" | "warn" | "risk";
  onLine: number;
  atRisk: number;
  oldestSec: number;
}

export function PressureBadge() {
  const { location } = useLocation();
  const [p, setP] = useState<Pressure | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/admin/pos/pressure?location=${encodeURIComponent(location)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (live && d) setP(d as Pressure); })
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, [location]);

  if (!p || (p.onLine === 0 && p.atRisk === 0)) return null;
  const mins = Math.floor(p.oldestSec / 60);
  return (
    <div className={`core-pressure ${p.tier}`} title="Kitchen pressure — at-risk · on the line · oldest ticket">
      <span className="pd" aria-hidden />
      {p.atRisk > 0 && <span className="pv">{p.atRisk} at-risk</span>}
      <span className="ps">line {p.onLine}</span>
      {mins > 0 && <span className="ps">· {mins}m wall</span>}
    </div>
  );
}
