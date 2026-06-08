"use client";

import { useMemo, useState } from "react";
import { useAdminLocation } from "@/shared/LocationContext";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { MENU_CATEGORY_LABELS, type MenuCategory, type MenuItem } from "@/data/types";

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "desserts", "drinks"];

const TAG_META: Record<MenuItem["tags"][number], { label: string; cls: string }> = {
  vegetarian: { label: "veg", cls: "veg" },
  vegan: { label: "vegan", cls: "veg" },
  spicy: { label: "spicy", cls: "hot" },
  "gluten-free": { label: "GF", cls: "fast" },
};

function zl(grosze: number): string {
  return (grosze / 100).toFixed(2).replace(".", ",");
}

/**
 * Core v2 · POS — the till. Step-3 scaffold: real per-location menu (category
 * rail + text-forward cards on live prices) on the new design language. The
 * open-check ticket (multi-tab, coursing, Charge) is wired next; for now it
 * shows the empty-check state so the surface reads honestly.
 */
export function CoreV2Pos({ menusByLocation }: { menusByLocation: Record<string, MenuItem[]> }) {
  const { location } = useAdminLocation();
  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const activeKey = location && menusByLocation[location] ? location : locationKeys[0];
  const menu = useMemo(() => menusByLocation[activeKey] ?? [], [menusByLocation, activeKey]);

  const categories = useMemo(() => {
    const present = new Set(menu.filter((m) => m.available).map((m) => m.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [menu]);

  const [cat, setCat] = useState<MenuCategory | null>(null);
  const activeCat = cat && categories.includes(cat) ? cat : categories[0] ?? null;
  const items = menu.filter((m) => m.available && m.category === activeCat);

  const countByCat = (c: MenuCategory) => menu.filter((m) => m.available && m.category === c).length;

  return (
    <CoreV2Shell
      eyebrow="Point of Sale · Till 1"
      tabs={[
        { label: "Order", active: true },
        { label: "Tender" },
      ]}
      subRight={<span className="cv-chip" style={{ height: 32 }}>Dine-in</span>}
    >
      <div className="cv-pos">
        <aside className="cv-rail">
          <div className="lbl">Menu</div>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={c === activeCat ? "cv-cat on" : "cv-cat"}
              onClick={() => setCat(c)}
            >
              {MENU_CATEGORY_LABELS[c]}
              <span className="n">{countByCat(c)}</span>
            </button>
          ))}
        </aside>

        <main className="cv-menu">
          <div className="cv-menu-grid">
            {items.map((m) => (
              <button key={m.id} type="button" className="cv-prod">
                <div className="pn">{m.name}</div>
                <div className="pd">{m.description}</div>
                <div className="cv-tagrow">
                  {m.tags.map((t) => (
                    <span key={t} className={`cv-tag ${TAG_META[t].cls}`}>
                      {TAG_META[t].label}
                    </span>
                  ))}
                </div>
                <div className="pf">
                  <span className="pp">{zl(m.price)}</span>
                  <span className="add" aria-hidden>
                    +
                  </span>
                </div>
              </button>
            ))}
          </div>
        </main>

        <aside className="cv-ticket">
          <div className="cv-ticket-empty">
            <div>
              <div className="ti">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path d="M5 3h14l-1.5 16.5a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9L5 3Z" />
                  <path d="M9 8h6" />
                </svg>
              </div>
              <h3>No open check</h3>
              <p>
                Tap a menu item to start a ticket. Multi-tab checks, coursing, cross-sell and Charge
                land in the next pass.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </CoreV2Shell>
  );
}
