"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * WhatsApp chat-simulator controls. When the owner flips the
 * `whatsappSimulatorEnabled` toggle in Settings, the WhatsApp console shows
 * manual Add 1 / Add 5 / Purge controls so staff can stage sandbox
 * conversations on demand — there is no auto-spawn. Each conversation is built
 * from the real menu and marked (sim); the server tags the session
 * simulated:true and tracks it in a registry so Purge removes them all.
 *
 * Returns:
 *   - `enabled`  — drives the controls (reacts live to the toggle)
 *   - `busy`     — true while an add/purge request is in flight (disables buttons)
 *   - `addConversations(count)` / `purgeAll()` — fire the controls
 */
export function useWhatsappSimulator(): {
  enabled: boolean;
  busy: boolean;
  addConversations: (count: number) => Promise<void>;
  purgeAll: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Track the settings toggle: load once, then react to the in-app "settings
  // updated" event the Settings page fires on save, so flipping the toggle
  // takes effect on an open console without a hard reload.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { whatsappSimulatorEnabled?: boolean };
        if (!cancelled) setEnabled(!!j.whatsappSimulatorEnabled);
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
    return fetch("/api/admin/whatsapp-simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const addConversations = useCallback(
    async (count: number) => {
      setBusy(true);
      try {
        await post({ action: "spawn", count });
      } catch {
        /* non-fatal — the console reconciles on its next poll */
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

  return { enabled, busy, addConversations, purgeAll };
}
