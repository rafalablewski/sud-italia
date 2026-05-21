"use client";

import { useMemo, useState } from "react";
import type { MenuItem, MenuCategory } from "@/data/types";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";
import { useCartStore } from "@/store/cart";
import { Bi } from "../Bi";
import { V8MenuItem } from "./V8MenuItem";
import { simulateLiveActivity } from "@/lib/growth-engine";
import { useEffect } from "react";

interface V8MenuSectionProps {
  items: MenuItem[];
  locationSlug: string;
  initialAvailability: Record<string, boolean>;
}

interface CategoryDef {
  key: MenuCategory | "all";
  en: string;
  pl: string;
  it: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: "all", en: "All", pl: "Wszystko", it: "tutto" },
  { key: "pizza", en: "Pizza", pl: "Pizza", it: "pizza" },
  { key: "pasta", en: "Pasta", pl: "Makaron", it: "pasta" },
  { key: "antipasti", en: "Starters", pl: "Przystawki", it: "antipasti" },
  { key: "panini", en: "Panini", pl: "Panini", it: "panini" },
  { key: "drinks", en: "Drinks", pl: "Napoje", it: "bibite" },
  { key: "desserts", en: "Desserts", pl: "Desery", it: "dolci" },
];

export function V8MenuSection({
  items,
  locationSlug,
  initialAvailability,
}: V8MenuSectionProps) {
  const availability = useLiveMenuAvailability(locationSlug, initialAvailability);
  const [activeCat, setActiveCat] = useState<MenuCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<ReturnType<typeof simulateLiveActivity> | null>(null);

  useEffect(() => {
    setActivity(simulateLiveActivity(locationSlug));
    const id = setInterval(() => setActivity(simulateLiveActivity(locationSlug)), 45_000);
    return () => clearInterval(id);
  }, [locationSlug]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: items.length };
    for (const i of items) {
      out[i.category] = (out[i.category] ?? 0) + 1;
    }
    return out;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCat !== "all" && i.category !== activeCat) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, activeCat, query]);

  return (
    <section id="menu" className="v8-section">
      <div className="v8-inner v8-inner-wide">
        <div className="v8-section-head">
          <div className="v8-eyebrow">
            <Bi en="The menu" pl="Menu" /> ·{" "}
            <span className="v8-it">il menù</span>
          </div>
          <h2 className="v8-title">
            <Bi en="What comes out of" pl="To, co wychodzi z" />{" "}
            <span className="v8-it">the oven</span>
          </h2>
          <p className="v8-sub">
            <Bi
              en="Cooked to order. Eaten standing up if you can manage it."
              pl="Robione na zamówienie. Najlepiej jeść na stojąco."
            />
          </p>
        </div>

        <div className="v8-menu-search">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M14 14 L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pizza, pasta, wine…"
            autoComplete="off"
          />
        </div>

        {activity && (
          <div className="v8-menu-live">
            <span className="v8-pulse-dot" aria-hidden="true" />
            <span>
              <strong className="v8-num">{activity.ordersInLastHour}</strong>{" "}
              <Bi en="orders in the last hour" pl="zamówień w ostatniej godzinie" />
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              <Bi en="Trending" pl="Popularne" />:{" "}
              <span className="v8-it">{activity.popularItemNow}</span>
            </span>
          </div>
        )}

        <div className="v8-menu-tabs" role="tablist">
          {CATEGORIES.map((c) => {
            const count = counts[c.key] ?? 0;
            if (c.key !== "all" && count === 0) return null;
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={activeCat === c.key}
                className={`v8-menu-tab${activeCat === c.key ? " on" : ""}`}
                onClick={() => setActiveCat(c.key)}
              >
                <Bi en={c.en} pl={c.pl} />
                {c.key !== "all" && (
                  <span className="v8-menu-tab-it"> · {c.it}</span>
                )}
                <span className="v8-menu-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="v8-menu-empty">
            <span className="v8-it">
              <Bi en="Nothing matches your search." pl="Brak wyników." /> · niente trovato
            </span>
          </div>
        ) : (
          <div className="v8-menu-grid">
            {filtered.map((item) => (
              <V8MenuItem
                key={item.id}
                item={item}
                locationSlug={locationSlug}
                available={availability[item.id] !== false}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Slim helper for surfaces that need to know the current cart count
 * without subscribing to the whole store (avoids over-rendering).
 * Currently unused — kept here in case V8MenuSection ever needs to
 * highlight "X items in cart" inline.
 */
export function useV8CartCount(): number {
  return useCartStore((s) => s.getItemCount());
}
