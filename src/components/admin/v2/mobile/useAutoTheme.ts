"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, readTheme, type ThemeMode } from "../theme";

const AUTO_KEY = "sud-admin-auto-theme";
const DAY_START_HOUR = 7; // 07:00 → switch to light
const DAY_END_HOUR = 19; // 19:00 → switch back to dark

function nowMode(): ThemeMode {
  const h = new Date().getHours();
  return h >= DAY_START_HOUR && h < DAY_END_HOUR ? "light" : "dark";
}

interface AutoThemeApi {
  enabled: boolean;
  toggle: () => void;
}

/**
 * Opt-in auto-theme. When enabled, the admin shell flips between dark
 * and light at 07:00 and 19:00 local time. Persists across sessions in
 * localStorage; the user can still manually override via the existing
 * ThemeToggle — that just stores the new mode and the auto-flip leaves
 * it alone until the next boundary.
 *
 * The boundaries are intentionally not configurable from the UI yet —
 * operators in a kitchen want consistent timing across the team. If we
 * ever ship a per-user "schedule" picker, this hook is the single
 * source of truth to extend.
 */
export function useAutoTheme(): AutoThemeApi {
  const [enabled, setEnabled] = useState(false);

  // Load opt-in state.
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(AUTO_KEY) === "1");
    } catch {
      /* storage blocked — non-fatal */
    }
  }, []);

  // While enabled, snap on every hour boundary.
  useEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const target = nowMode();
      if (readTheme() !== target) applyTheme(target);
    };
    apply();
    // Schedule the next flip at the next hour boundary, then once an
    // hour thereafter. setInterval relative to a boundary would drift,
    // so we re-schedule on each tick.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const d = new Date();
      const ms =
        (60 - d.getMinutes()) * 60 * 1000 -
        d.getSeconds() * 1000 -
        d.getMilliseconds();
      timer = setTimeout(() => {
        apply();
        schedule();
      }, Math.max(1000, ms));
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      if (next) {
        applyTheme(nowMode());
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
