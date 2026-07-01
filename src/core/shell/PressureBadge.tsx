"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/shared/LocationContext";

/**
 * PressureBadge — the Command Bar telemetry cluster's live load reading (`risk
 * N`, the one place global state lives, visible on every lens). Polls the
 * shared kitchen pressure (`/api/admin/pos/pressure` → the same predictive tier
 * the KDS colours from) and colour-codes the count amber/red on warn/risk so a
 * server feels the room heat without opening a dashboard. The full breakdown
 * (at-risk · on the line · oldest ticket) stays in the hover title. Hidden
 * until the first poll resolves.
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

  if (!p) return null;
  const mins = Math.floor(p.oldestSec / 60);
  const tone = p.tier === "risk" ? "risk" : p.tier === "warn" ? "warn" : "ok";
  const detail = `Kitchen pressure — ${p.atRisk} at-risk · line ${p.onLine}${mins > 0 ? ` · ${mins}m wall` : ""}`;
  return (
    <span className={`cm-tel-item ${tone}`} title={detail}>
      <span className="lbl">risk</span>
      <span className="val">{p.atRisk}</span>
    </span>
  );
}
