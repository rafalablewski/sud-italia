"use client";

import { useEffect, useRef, useState } from "react";

/**
 * KDS order-simulator driver (m2_x). When the owner flips the
 * `kdsSimulatorEnabled` toggle in Settings, the Kitchen Display itself becomes
 * the generator: while a board is open it streams a steady trickle of
 * synthetic tickets onto the live KDS (clearly marked as SIMULATION) and walks
 * them forward, so staff can train against a realistic rush without any
 * separate tab. The server tags every ticket simulated:true, so they stay off
 * the dashboard, Orders list and every report.
 *
 * Returns `{ enabled }` so the board can render the simulation banner.
 */

const SPAWN_MS = 6000;
const ADVANCE_MS = 3000;

export function useKdsSimulator(location: string | null | undefined): { enabled: boolean } {
  const [enabled, setEnabled] = useState(false);

  // Keep the latest location in a ref so the long-lived intervals always post
  // to the currently-selected truck without resubscribing.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Track the settings toggle: load once, then react to the in-app
  // "settings updated" event the Settings page fires on save, so flipping the
  // toggle takes effect on an open board without a hard reload.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { kdsSimulatorEnabled?: boolean };
        if (!cancelled) setEnabled(!!j.kdsSimulatorEnabled);
      } catch {
        /* non-fatal — leave whatever we had */
      }
    };
    void load();
    const onUpdate = () => void load();
    window.addEventListener("sud-admin-settings-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("sud-admin-settings-updated", onUpdate);
    };
  }, []);

  // Generator loops — only while enabled. Spawn a steady trickle and walk
  // tickets forward; the board picks new tickets up over its SSE stream. The
  // server self-caps the active count, so multiple open boards can't flood it.
  useEffect(() => {
    if (!enabled) return;
    const post = (body: Record<string, unknown>) => {
      const loc = locationRef.current;
      const qs = loc ? `?location=${encodeURIComponent(loc)}` : "";
      return fetch(`/api/admin/kds-simulator${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    };
    void post({ action: "spawn", count: 1 }); // immediate first ticket
    const spawn = setInterval(() => void post({ action: "spawn", count: 1 }), SPAWN_MS);
    const advance = setInterval(() => void post({ action: "advance" }), ADVANCE_MS);
    return () => {
      clearInterval(spawn);
      clearInterval(advance);
    };
  }, [enabled]);

  return { enabled };
}
