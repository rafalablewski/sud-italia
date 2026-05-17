"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Search, Tag } from "lucide-react";
import type { MenuCategory, MenuItem } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { formatPrice } from "@/lib/utils";
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

/**
 * Mobile menu — list view with category chip filter, search, and inline
 * availability toggle. Full edit (price/cost/modifiers) is desktop-only
 * per the audit; mobile gets the high-frequency "toggle 86" action.
 */
export function MobileMenu() {
  const toast = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cat, setCat] = useState<MenuCategory | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/menu");
    if (!r.ok) return;
    const data = await r.json();
    setItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

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
      const r = await fetch(`/api/admin/menu/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: target }),
      });
      if (!r.ok) {
        toast.error("Could not update");
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

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          subtitle={`${filtered.length} of ${items.length}`}
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
        <MobileList items={rows} virtualizeAt={64} />
      </MobilePage>
    </PullToRefresh>
  );
}
