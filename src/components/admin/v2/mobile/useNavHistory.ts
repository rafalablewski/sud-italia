"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "sud-admin-nav-history";
const MAX_ROWS = 50;
const WINDOW_DAYS = 14;

interface Hit {
  href: string;
  at: number; // ms since epoch
}

/**
 * Tracks which admin routes the operator visits and surfaces a "frequent"
 * list for the MoreDrawer. Follows Toast's "Recent" pattern — visit count
 * over a rolling 14-day window, decayed by age.
 */
export function useNavHistory(): { recent: string[]; frequent: string[] } {
  const pathname = usePathname();
  const [hits, setHits] = useState<Hit[]>([]);
  // Re-sample "now" every 10 minutes so the decay window in `frequent`
  // stays fresh. Keeping it in state avoids calling Date.now() inside
  // useMemo (lint flags that as impure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  // Load on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHits(parsed as Hit[]);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Record each route change.
  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    setHits((prev) => {
      const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const trimmed = prev.filter((h) => h.at >= cutoff);
      const next = [...trimmed, { href: pathname, at: Date.now() }].slice(-MAX_ROWS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage may be blocked — non-fatal */
      }
      return next;
    });
  }, [pathname]);

  return useMemo(() => {
    // Recent = unique routes, newest first, excluding the current one.
    const seen = new Set<string>();
    const recent: string[] = [];
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (h.href === pathname) continue;
      if (seen.has(h.href)) continue;
      seen.add(h.href);
      recent.push(h.href);
      if (recent.length >= 5) break;
    }

    // Frequent = highest decayed score across the window.
    const scores = new Map<string, number>();
    for (const h of hits) {
      if (h.href === pathname) continue;
      const ageDays = (now - h.at) / (24 * 60 * 60 * 1000);
      const weight = Math.max(0.1, 1 - ageDays / WINDOW_DAYS);
      scores.set(h.href, (scores.get(h.href) ?? 0) + weight);
    }
    const frequent = Array.from(scores.entries())
      .filter(([, s]) => s >= 2) // at least ~2 visits worth of weight
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([href]) => href);

    return { recent, frequent };
  }, [hits, pathname, now]);
}
