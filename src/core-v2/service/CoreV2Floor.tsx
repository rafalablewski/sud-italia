"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { serviceTabs } from "./serviceTabs";

interface TwinTableRow {
  id: string;
  number: string;
  seats: number;
  zone?: string;
  status: "available" | "seated" | "reserved" | "out-of-service";
  occupied: boolean;
  elapsedMin: number | null;
  predictedFreeInMin: number | null;
  party: number | null;
  openCheckGrosze: number | null;
  medianDwellMin: number | null;
}
interface FloorTwin {
  tables: TwinTableRow[];
  summary: {
    totalTables: number;
    openTables: number;
    seated: number;
    occupancyPct: number;
    freeingSoon15: number;
    medianTurnMin: number | null;
  };
}
interface Kitchen {
  tier: "calm" | "warn" | "risk";
  label: string | null;
  util: number;
}

const zl = (g: number) => (g / 100).toFixed(0);

/**
 * Core v2 · Service · Floor — the live room, wired to the same engine as today's
 * /core/service/floor: GET /api/admin/floor-twin → { twin, kitchen }; seat/clear
 * via POST /api/admin/floor-twin { action, tableId }. Zoned table tiles + a
 * KPI strip + the kitchen-bottleneck banner. Own cv- UI.
 */
export function CoreV2Floor() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setTwin(d.twin ?? d);
      setKitchen(d.kitchen ?? null);
    } catch {
      /* non-fatal */
    }
  }, [loc]);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (t: TwinTableRow) => {
    if (acting || t.status === "out-of-service") return;
    const action = t.occupied ? "clear" : "seat";
    setActing(true);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tableId: t.id }),
      });
      if (res.ok) {
        toast(`Table ${t.number} ${action === "seat" ? "seated" : "cleared"}`, "success");
        await load();
      } else toast("Could not update table", "danger");
    } finally {
      setActing(false);
    }
  };

  const zones = useMemo(() => {
    const m = new Map<string, TwinTableRow[]>();
    for (const t of twin?.tables ?? []) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [twin]);

  const s = twin?.summary;
  const stateOf = (t: TwinTableRow): { cls: string; label: string } => {
    if (t.status === "out-of-service") return { cls: "oos", label: "Out of service" };
    if (t.occupied && t.predictedFreeInMin != null && t.predictedFreeInMin <= 15)
      return { cls: "freeing", label: `Freeing ~${Math.max(0, t.predictedFreeInMin)}m` };
    if (t.occupied) return { cls: "seated", label: t.elapsedMin != null ? `Seated ${t.elapsedMin}m` : "Seated" };
    if (t.status === "reserved") return { cls: "booked", label: "Reserved" };
    return { cls: "free", label: "Free" };
  };

  return (
    <CoreV2Shell
      eyebrow="Service · Floor & Slots"
      tabs={serviceTabs("floor")}
      subRight={<button type="button" className="cv-iconbtn" title="Refresh" onClick={() => void load()}>⟳</button>}
    >
      <div className="cv-guest-inbox">
        <div className="cv-kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="k"><div className="kl">Covers seated</div><div className="kv mono">{s ? `${s.seated} / ${s.totalTables}` : "—"}</div></div>
          <div className="k"><div className="kl">Occupancy</div><div className="kv mono">{s ? `${Math.round(s.occupancyPct)}%` : "—"}</div></div>
          <div className="k"><div className="kl">Turn time</div><div className="kv mono">{s?.medianTurnMin != null ? `${s.medianTurnMin}m` : "—"}</div></div>
          <div className="k"><div className="kl">Freeing ≤15m</div><div className="kv mono">{s?.freeingSoon15 ?? "—"}</div></div>
        </div>

        {kitchen && kitchen.tier !== "calm" && (
          <div className={`cv-bottleneck ${kitchen.tier}`}>
            <span className="dot" />
            Kitchen {kitchen.tier === "risk" ? "at risk" : "warming"} — {kitchen.label ?? "a station"} at {Math.round(kitchen.util)}% · pace the seating
          </div>
        )}

        <div className="cv-floor">
          {!twin ? (
            <div className="cv-ctx-empty pad">Loading floor…</div>
          ) : zones.length === 0 ? (
            <div className="cv-ctx-empty pad">No tables configured for this truck.</div>
          ) : (
            zones.map(([zone, tbls]) => (
              <div key={zone}>
                <div className="cv-zone-h">
                  <span className="zt">{zone}</span>
                  <span className="cv-cust-sub">{tbls.length} tables · {tbls.reduce((a, t) => a + t.seats, 0)} covers</span>
                </div>
                <div className="cv-tables">
                  {tbls.map((t) => {
                    const st = stateOf(t);
                    return (
                      <button key={t.id} className={`cv-tbl2 ${st.cls}`} onClick={() => void act(t)} disabled={acting || t.status === "out-of-service"} title={t.occupied ? "Clear table" : "Seat table"}>
                        <span className="tnum">{t.number}</span>
                        <span className="tcap">{t.party ? `${t.party} / ${t.seats}` : `${t.seats} seats`}</span>
                        <span className={`tst ${st.cls}`}>● {st.label}</span>
                        {t.openCheckGrosze ? <span className="tinfo mono">{zl(t.openCheckGrosze)} zł open</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </CoreV2Shell>
  );
}
