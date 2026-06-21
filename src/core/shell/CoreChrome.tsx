"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/shared/LocationContext";

/**
 * Location chip — shows the active truck (real data from LocationContext) and
 * cycles through [All trucks · …active locations] on click. Same store the
 * rest of Core reads, so a switch here follows you across surfaces.
 */
export function CoreLocationChip() {
  const { location, setLocation, activeLocations } = useLocation();
  const order = ["", ...activeLocations.map((l) => l.slug)];
  const current = activeLocations.find((l) => l.slug === location);
  const label = current ? current.name : "All restaurants";
  return (
    <button
      type="button"
      className="core-chip"
      title="Switch location"
      onClick={() => {
        const i = order.indexOf(location);
        setLocation(order[(i + 1) % order.length]);
      }}
    >
      <span className="dot" />
      {label}
    </button>
  );
}

/** Live HH:MM clock for the command bar — the till + line read it at a glance. */
export function CoreClock() {
  const [now, setNow] = useState<string>("--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000 * 15);
    return () => clearInterval(id);
  }, []);
  return <span className="core-clock" aria-label="Current time">{now}</span>;
}

/**
 * Light / dark toggle. Core manages its OWN theme (independent of the admin
 * theme boot) by writing `data-theme` on the nearest `.core` wrapper. The
 * default follows the server-rendered attribute (which is skin-aware — e.g.
 * the Solare daylight skin defaults to light); the choice persists to
 * localStorage ONLY when the operator actually toggles, so an unchosen default
 * never gets pinned and can re-resolve when the active skin changes. KDS
 * ignores this (its wall is always dark) — it sets the attribute on its own scope.
 */
export function CoreThemeToggle() {
  // null = "not resolved yet — follow the SSR attribute". Resolved on mount
  // from localStorage (explicit choice) or the server-rendered default.
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("core-theme")) as
      | "dark"
      | "light"
      | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else {
      // No explicit choice — adopt the skin-aware default the server rendered.
      const ssr = document.querySelector(".core")?.getAttribute("data-theme");
      setTheme(ssr === "light" ? "light" : "dark");
    }
  }, []);

  useEffect(() => {
    if (theme === null) return; // leave the SSR attribute untouched until resolved
    const root = document.querySelector(".core");
    if (root) root.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = () => {
    const next = (theme ?? "dark") === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("core-theme", next); // persist only on an explicit choice
    } catch {
      /* private mode — non-fatal */
    }
  };

  const shown = theme ?? "dark";
  return (
    <button
      type="button"
      className="core-iconbtn"
      title={shown === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle light or dark"
      onClick={toggle}
    >
      {shown === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
