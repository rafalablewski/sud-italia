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

// Synthetic orders should arrive the way real ones do — in uneven bursts and
// lulls, not on a metronome. Each spawn self-schedules the next after a random
// gap, and occasionally lands two at once (a couple + a walk-up arriving
// together), so the board fills organically instead of ticking once every 6s.
const SPAWN_GAP_MIN_MS = 4_500;
const SPAWN_GAP_MAX_MS = 14_000;
const BURST_CHANCE = 0.18; // chance a spawn drops 2 tickets instead of 1
// The board reconciles ticket statuses on a short steady poll; the natural
// per-ticket pace lives in the server's dwell jitter, not here.
const ADVANCE_MS = 3000;

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

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
    let cancelled = false;
    let spawnTimer: ReturnType<typeof setTimeout> | undefined;

    const post = (body: Record<string, unknown>) => {
      const loc = locationRef.current;
      const qs = loc ? `?location=${encodeURIComponent(loc)}` : "";
      return fetch(`/api/admin/kds-simulator${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    };

    const scheduleSpawn = (delayMs: number) => {
      spawnTimer = setTimeout(async () => {
        if (cancelled) return;
        await post({ action: "spawn", count: Math.random() < BURST_CHANCE ? 2 : 1 });
        if (cancelled) return;
        scheduleSpawn(randBetween(SPAWN_GAP_MIN_MS, SPAWN_GAP_MAX_MS));
      }, delayMs);
    };

    // First ticket lands soon — so flipping the toggle visibly works — but not
    // on an instant robotic beat; every arrival after it is organically spaced.
    scheduleSpawn(randBetween(700, 2_000));
    const advance = setInterval(() => void post({ action: "advance" }), ADVANCE_MS);

    return () => {
      cancelled = true;
      if (spawnTimer) clearTimeout(spawnTimer);
      clearInterval(advance);
    };
  }, [enabled]);

  return { enabled };
}
