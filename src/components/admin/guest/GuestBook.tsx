"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { CoreShell } from "../core/CoreShell";
import { GuestViewNav } from "./GuestViewNav";
import { BookView } from "../service/BookView";

/**
 * Book view inside the Guest Engagement hub (`/core/guest/book`). The unified
 * slot+table booking console (the BookView body) rendered on the Guest CoreShell
 * with the same loc/date topbar as the Service surface — the chosen city is
 * shared with Service via the `sud-core-service-loc` key. See
 * docs/design-system/core/modules/guest.md.
 */

const LOCS = getActiveLocations().map((l) => ({ key: l.slug, label: l.city }));
const FALLBACK = LOCS[0]?.key ?? "krakow";
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

export function GuestBook() {
  const [loc, setLoc] = useState<string>(FALLBACK);
  const [date, setDate] = useState<string>(isoTodayUtc);

  useEffect(() => {
    // Correct to local today (an operator past UTC-midnight would otherwise
    // default to the wrong day); after mount, so no hydration mismatch.
    setDate(localToday());
    try {
      const v = localStorage.getItem(LOC_KEY);
      if (v && LOCS.some((l) => l.key === v)) setLoc(v);
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const pickLoc = (key: string) => {
    setLoc(key);
    try {
      localStorage.setItem(LOC_KEY, key);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <CoreShell
      eyebrow="Guest Engagement · Book"
      viewnav={<GuestViewNav current="book" />}
      right={
        <>
          <div className="seg">
            {LOCS.map((l) => (
              <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => pickLoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
          <label className="svc-date">
            <CalendarDays width={14} height={14} />
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </>
      }
    >
      <BookView loc={loc} date={date} />
    </CoreShell>
  );
}
