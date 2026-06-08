"use client";

import { useEffect, useMemo, useState } from "react";
import { CoreShellV2 } from "@/core-v2/shell/CoreShellV2";
import { useAdminLocation } from "@/shared/LocationContext";
import { FloorView } from "./FloorView";
import { SlotsView } from "./SlotsView";

/**
 * Service surface — Core v2 (`.corev2`). Re-skins the Service surface
 * (`src/core/service/*`) onto the separated Core v2 theme + CoreShellV2 sidebar
 * shell. Floor / Slots switch client-side (NOT nested routes); the topbar holds
 * the `.viewnav` (Floor / Slots) plus the location `.seg` and — for Slots — the
 * date picker. Wired to the SAME real endpoints as the v1 Service surface:
 *   Floor → /api/admin/floor-twin · /api/admin/floor/tables
 *   Slots → /api/admin/slots · /api/admin/demand-exchange
 * Location persistence mirrors the v1 frame (localStorage["sud-core-service-loc"]).
 */

type ServiceView = "floor" | "slots";

// Shared so the chosen city survives Floor ↔ Slots view switches (same key the
// v1 ServiceFrame uses, so the operator's choice carries across surfaces).
const LOC_KEY = "sud-core-service-loc";

// SSR-safe default: UTC today is deterministic across server + client, so the
// initial render matches and there's no hydration mismatch. The mount effect
// then corrects it to the operator's *local* today.
function isoTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarIco() {
  return (
    <svg className="icn" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ArmchairIco() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <path d="M5 11a2 2 0 0 0-2 2v3h18v-3a2 2 0 0 0-2-2" />
      <path d="M5 16v3M19 16v3" />
    </svg>
  );
}
function SlotsIco() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

const VIEWS: { id: ServiceView; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "floor", label: "Floor", Icon: ArmchairIco },
  { id: "slots", label: "Slots", Icon: SlotsIco },
];

export function ServiceV2() {
  const { activeLocations } = useAdminLocation();

  const locOptions = useMemo(
    () => activeLocations.map((l) => ({ key: l.slug, label: l.city })),
    [activeLocations],
  );
  const fallback = locOptions[0]?.key ?? "krakow";

  const [view, setView] = useState<ServiceView>("floor");
  const [loc, setLoc] = useState<string>(fallback);
  const [date, setDate] = useState<string>(isoTodayUtc);

  useEffect(() => {
    // Correct to local today (an operator past UTC-midnight would otherwise
    // default to the wrong day); after mount, so no hydration mismatch.
    setDate(localToday());
    try {
      const v = localStorage.getItem(LOC_KEY);
      if (v && locOptions.some((l) => l.key === v)) setLoc(v);
    } catch {
      /* storage may be blocked */
    }
  }, [locOptions]);

  const pickLoc = (key: string) => {
    setLoc(key);
    try {
      localStorage.setItem(LOC_KEY, key);
    } catch {
      /* non-fatal */
    }
  };

  const topbar = (
    <>
      <div className="viewnav" style={{ marginLeft: 8 }}>
        {VIEWS.map((v) => {
          const { Icon } = v;
          return (
            <button
              key={v.id}
              type="button"
              className={v.id === view ? "on" : ""}
              aria-current={v.id === view ? "page" : undefined}
              onClick={() => setView(v.id)}
            >
              <Icon />
              {v.label}
            </button>
          );
        })}
      </div>
      <div className="topbar-right">
        {view === "slots" && (
          <label className="svc-date">
            <CalendarIco />
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
        <div className="seg">
          {locOptions.map((l) => (
            <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => pickLoc(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <CoreShellV2 active="floor" crumb="Service" topbar={topbar}>
      {view === "floor" ? <FloorView loc={loc} /> : <SlotsView loc={loc} date={date} />}
    </CoreShellV2>
  );
}
