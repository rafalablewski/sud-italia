"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * KDS order-simulator controls. When the owner flips the `kdsSimulatorEnabled`
 * toggle in Settings, the Kitchen Display shows manual Add 1 / Add 5 / Purge
 * all controls in its top toolbar so staff can stage a training rush on
 * demand — there is no auto-spawning trickle. Added tickets are clearly marked
 * SIMULATION; the cook works them through the board with the normal ticket
 * buttons. The server tags every ticket simulated:true, so they stay off the
 * dashboard, Orders list and every report.
 *
 * Returns:
 *   - `enabled`  — drives the banner + controls (reacts live to the toggle)
 *   - `busy`     — true while an add/purge request is in flight (disables buttons)
 *   - `addOrders(count)` / `purgeAll()` — fire the controls
 */
export function useKdsSimulator(location: string | null | undefined): {
  enabled: boolean;
  busy: boolean;
  addOrders: (count: number) => Promise<void>;
  purgeAll: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep the latest location in a ref so the stable action callbacks always
  // post to the currently-selected truck without being recreated.
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

  const post = useCallback((body: Record<string, unknown>) => {
    const loc = locationRef.current;
    const qs = loc ? `?location=${encodeURIComponent(loc)}` : "";
    return fetch(`/api/admin/kds-simulator${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const addOrders = useCallback(
    async (count: number) => {
      setBusy(true);
      try {
        await post({ action: "spawn", count });
      } catch {
        /* non-fatal — the board reconciles on its next stream frame */
      } finally {
        setBusy(false);
      }
    },
    [post],
  );

  const purgeAll = useCallback(async () => {
    setBusy(true);
    try {
      await post({ action: "purge" });
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  }, [post]);

  return { enabled, busy, addOrders, purgeAll };
}
