"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Search, Tag } from "lucide-react";
import type { MenuCategory, MenuItem } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

const CATEGORIES: (MenuCategory | "all")[] = [
  "all",
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

const FALLBACK_LOC = getActiveLocations()[0]?.slug ?? "krakow";

/**
 * Mobile menu — list view with category chip filter, search, and inline
 * availability toggle. Full edit (price/cost/modifiers) is desktop-only
 * per the audit; mobile gets the high-frequency "toggle 86" action.
 *
 * Menu items vary per-location (price overrides + custom items), so the
 * mobile view is location-scoped: when no global location is set, we
 * default to the first active truck and let the user swap via chips.
 * Hitting `/api/admin/menu` without a slug returns a `Record<slug, MenuItem[]>`
 * object — that was the bug behind the empty list on first ship.
 */
export function MobileMenu() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cat, setCat] = useState<MenuCategory | "all">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const activeLocations = useMemo(() => getActiveLocations(), []);

  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/menu?location=${encodeURIComponent(pageLoc)}`);
      if (!r.ok) {
        setItems([]);
        return;
      }
      const data = await r.json();
      // Defensive: the per-location call returns MenuItem[], but if a
      // future change reverts to the keyed shape we degrade gracefully.
      if (Array.isArray(data)) {
        setItems(data);
      } else if (data && typeof data === "object" && Array.isArray(data[pageLoc])) {
        setItems(data[pageLoc]);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoc]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => cat === "all" || i.category === cat)
      .filter((i) => {
        if (!needle) return true;
        return (
          i.name.toLowerCase().includes(needle) ||
          (i.description ?? "").toLowerCase().includes(needle)
        );
      });
  }, [items, cat, q]);

  const toggleAvailability = async (item: MenuItem) => {
    setBusy(item.id);
    const target = !item.available;
    setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, available: target } : i)));
    try {
      // Bulk endpoint mirrors what the desktop AdminMenu does — a single
      // PUT with {id, available} updates the override map.
      const r = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, available: target }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not update", data.error);
        setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, available: !target } : i)));
        return;
      }
      toast.success(target ? "Re-enabled" : "Marked 86");
    } finally {
      setBusy(null);
    }
  };

  const rows: MobileListItem<MenuItem>[] = filtered.map((it) => ({
    id: it.id,
    data: it,
    icon: it.available ? Eye : EyeOff,
    iconTone: it.available ? "success" : "neutral",
    title: it.name,
    subtitle: `${MENU_CATEGORY_LABELS[it.category] ?? it.category}${it.tags.length ? ` · ${it.tags.join(", ")}` : ""}`,
    trailing: formatPrice(it.price),
    onTap: () => toggleAvailability(it),
    rightAction: it.available
      ? {
          label: "86",
          tone: "danger" as const,
          onCommit: () => toggleAvailability(it),
        }
      : {
          label: "Re-enable",
          tone: "success" as const,
          onCommit: () => toggleAvailability(it),
        },
  }));

  const empty =
    loading ? (
      <div className="v2-m-empty">
        <div className="v2-m-empty-title">Loading…</div>
      </div>
    ) : items.length === 0 ? (
      <div className="v2-m-empty">
        <Tag className="h-6 w-6" aria-hidden />
        <div className="v2-m-empty-title">No menu for {pageLoc}</div>
        <div className="v2-m-empty-desc">Pick another location above.</div>
      </div>
    ) : (
      <div className="v2-m-empty">
        <div className="v2-m-empty-title">No matches</div>
        <div className="v2-m-empty-desc">Try a different category or search.</div>
      </div>
    );

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ChipStrip ariaLabel="Location">
              {activeLocations.map((l) => (
                <Chip
                  key={l.slug}
                  label={l.city}
                  active={pageLoc === l.slug}
                  onClick={() => setPageLoc(l.slug)}
                />
              ))}
            </ChipStrip>
            <ChipStrip ariaLabel="Category">
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={c === "all" ? "All" : MENU_CATEGORY_LABELS[c]}
                  active={cat === c}
                  onClick={() => setCat(c)}
                  count={c === "all" ? items.length : items.filter((i) => i.category === c).length}
                />
              ))}
            </ChipStrip>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg-subtle)",
              }}
            >
              <Search className="h-4 w-4" aria-hidden />
              <input
                type="search"
                inputMode="search"
                placeholder="Search menu…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: 0,
                  color: "var(--fg)",
                  fontSize: 16,
                  fontFamily: "var(--font-ui)",
                }}
              />
            </label>
          </div>
        }
      >
        <PageHeader
          title="Menu"
          subtitle={
            loading
              ? `Loading ${pageLoc.toUpperCase()}…`
              : `${filtered.length} of ${items.length} · ${pageLoc.toUpperCase()}`
          }
          actions={
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--fg-subtle)",
              }}
            >
              <Tag className="h-3 w-3" aria-hidden /> Tap to 86
            </span>
          }
        />
        <MobileList items={rows} virtualizeAt={64} empty={empty} />
      </MobilePage>
    </PullToRefresh>
  );
}
