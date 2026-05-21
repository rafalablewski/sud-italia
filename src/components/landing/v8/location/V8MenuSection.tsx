"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem, MenuCategory } from "@/data/types";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";
import { useCartStore } from "@/store/cart";
import { Bi } from "../Bi";
import { V8MenuItem } from "./V8MenuItem";
import { simulateLiveActivity } from "@/lib/growth-engine";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";

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

function GuaranteeIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="28" cy="28" r="18" stroke="#9A4A2B" strokeWidth="1.8" fill="rgba(184,92,56,0.06)" />
      <path d="M28 12 L28 14 M28 42 L28 44 M12 28 L14 28 M42 28 L44 28" stroke="#9A4A2B" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M28 28 L28 16 M28 28 L36 32" stroke="#9A4A2B" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="28" cy="28" r="1.8" fill="#9A4A2B" />
      <path d="M16 42 C 22 46, 34 46, 40 42" stroke="#9A4A2B" strokeWidth="1.3" fill="none" opacity="0.5" />
    </svg>
  );
}

function ComboPizzaSvg() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 32 L20 6 L34 32 Z" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 32 L34 32" stroke="#7A2B2B" strokeWidth="1.5" />
      <circle cx="16" cy="24" r="2" fill="#7A2B2B" />
      <circle cx="24" cy="22" r="2" fill="#7A2B2B" />
      <circle cx="20" cy="28" r="2" fill="#7A2B2B" />
      <circle cx="19" cy="16" r="1.5" fill="#4A7C59" />
    </svg>
  );
}

function ComboPastaSvg() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="22" r="13" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
      <path d="M12 20 C 14 17, 18 17, 20 20 C 22 23, 26 23, 28 20" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
      <path d="M12 24 C 14 21, 18 21, 20 24 C 22 27, 26 27, 28 24" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
      <path d="M12 22 C 14 19, 18 19, 20 22 C 22 25, 26 25, 28 22" stroke="#B85C38" strokeWidth="1.2" fill="none" />
      <circle cx="18" cy="20" r="1.2" fill="#7A2B2B" />
      <circle cx="25" cy="24" r="1.2" fill="#7A2B2B" />
    </svg>
  );
}

function SurpriseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(201,162,62,0.1)" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

const COMBO_SVG_BY_ID: Record<string, () => React.ReactNode> = {
  "italian-classic": ComboPizzaSvg,
  "classic-pasta-deal": ComboPastaSvg,
};

export function V8MenuSection({
  items,
  locationSlug,
  initialAvailability,
}: V8MenuSectionProps) {
  const availability = useLiveMenuAvailability(locationSlug, initialAvailability);
  const [activeCat, setActiveCat] = useState<MenuCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<ReturnType<typeof simulateLiveActivity> | null>(null);
  const [hotIds, setHotIds] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    setActivity(simulateLiveActivity(locationSlug));
    const id = setInterval(() => setActivity(simulateLiveActivity(locationSlug)), 45_000);
    return () => clearInterval(id);
  }, [locationSlug]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/menu/item-popularity?location=${encodeURIComponent(locationSlug)}`)
      .then((r) => r.json())
      .then((data: { itemIds?: string[] }) => {
        if (!cancelled) setHotIds(new Set(data.itemIds ?? []));
      })
      .catch(() => {
        if (!cancelled) setHotIds(new Set());
      });
    return () => {
      cancelled = true;
    };
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

  const handleSurprise = () => {
    // Pick a random in-stock pizza/pasta to highlight + add to cart.
    const candidates = items.filter(
      (i) => availability[i.id] !== false && (i.category === "pizza" || i.category === "pasta"),
    );
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setActiveCat("all");
    setQuery("");
    setHighlight(pick.id);
    addItem(pick, locationSlug);
    setTimeout(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-item-id="${pick.id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    setTimeout(() => setHighlight(null), 2000);
  };

  // Combo deals: pick those that match the location (or no channel constraint).
  // They are shown inline above the menu items as marketing cards.
  const inlineCombos = useMemo(() => DEFAULT_COMBO_DEALS.slice(0, 2), []);

  return (
    <section id="menu" className="v8-section v8-alt">
      <div className="v8-inner v8-inner-wide">
        <div className="v8-section-head">
          <div className="v8-eyebrow">
            <Bi en="The menu" pl="Menu" /> · <span className="v8-it">il menù</span>
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
              <span className="v8-it"> · ordini nell&apos;ultima ora</span>
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              <Bi en="Trending" pl="Popularne" />
              <span className="v8-it"> · in tendenza</span>:{" "}
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

        <div className="v8-guarantee">
          <div className="v8-guarantee-icon">
            <GuaranteeIcon />
          </div>
          <div className="v8-guarantee-text">
            <div className="v8-guarantee-title">
              <Bi en="15 minutes guaranteed" pl="15 minut gwarancji" />{" "}
              <span className="v8-it">· 15 minuti garantiti</span>
            </div>
            <div className="v8-guarantee-sub">
              <Bi
                en="Ready in 15 minutes — or your next drink's on us."
                pl="Gotowe w 15 minut — albo następny napój na nasz koszt."
              />
            </div>
          </div>
        </div>

        {inlineCombos.length > 0 && (
          <div className="v8-combos">
            {inlineCombos.map((c) => {
              const Illus = COMBO_SVG_BY_ID[c.id] ?? ComboPizzaSvg;
              return (
                <div key={c.id} className="v8-combo-card">
                  <div className="v8-combo-card-illus">
                    <Illus />
                  </div>
                  <div className="v8-combo-card-body">
                    <div className="v8-combo-card-title">{c.name}</div>
                    <div className="v8-combo-card-sub">{c.description}</div>
                  </div>
                  <div className="v8-wax-seal" aria-label={`${c.discountPercent} percent discount`}>
                    −{c.discountPercent}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="v8-surprise" onClick={handleSurprise}>
          <SurpriseIcon />
          <Bi en="Surprise me" pl="Zaskocz mnie" />
          <span className="v8-it"> · sorprendimi</span>
        </button>

        {filtered.length === 0 ? (
          <div className="v8-menu-empty">
            <span className="v8-it">
              <Bi en="Nothing matches your search." pl="Brak wyników." /> · niente trovato
            </span>
          </div>
        ) : (
          <div className="v8-menu-grid" ref={gridRef}>
            {filtered.map((item) => (
              <div
                key={item.id}
                data-item-id={item.id}
                className={highlight === item.id ? "v8-mi-highlight" : ""}
              >
                <V8MenuItem
                  item={item}
                  locationSlug={locationSlug}
                  available={availability[item.id] !== false}
                  popularThisWeek={hotIds.has(item.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
