"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Eye,
  EyeOff,
  IceCream,
  MapPin,
  Pencil,
  Pizza,
  Salad,
  Sandwich,
  Search,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Button,
  Card,
  CardBody,
  Dialog,
  EmptyState,
  Input,
  Select,
  Tabs,
  Textarea,
} from "./v2/ui";

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

const CATEGORY_ICON: Record<MenuCategory, LucideIcon> = {
  pizza: Pizza,
  pasta: UtensilsCrossed,
  antipasti: Salad,
  panini: Sandwich,
  drinks: Coffee,
  desserts: IceCream,
};

interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  category: MenuCategory;
  tags: string[];
  available: boolean;
  _hasOverride: boolean;
}

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

function marginPct(price: number, cost: number): number {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 100);
}

function marginTone(margin: number): "danger" | "warning" | "success" {
  if (margin < 50) return "danger";
  if (margin < 65) return "warning";
  return "success";
}

export function AdminMenu() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();

  // Menu is always for a single location — fall back to first active loc when
  // "All locations" is selected in the sidebar (the menu endpoint requires a
  // specific location).
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [items, setItems] = useState<MenuItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [editing, setEditing] = useState<MenuItemData | null>(null);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/menu?location=${pageLoc}`);
      if (res.ok) {
        const data: MenuItemData[] = await res.json();
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const persistChange = useCallback(
    async (id: string, change: { price?: number; available?: boolean; description?: string }) => {
      const res = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: { [id]: change } }),
      });
      return res.ok;
    },
    [],
  );

  const toggleAvailability = async (item: MenuItemData) => {
    const next = !item.available;
    // Optimistic
    setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, available: next, _hasOverride: true } : i)));
    const ok = await persistChange(item.id, { available: next });
    if (!ok) {
      toast.error("Could not save", "Reverting availability.");
      setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, available: !next } : i)));
    } else {
      toast.success(next ? "Item available" : "Item hidden", item.name);
    }
  };

  const saveEdit = async (id: string, change: { price?: number; description?: string }) => {
    const ok = await persistChange(id, change);
    if (ok) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(change.price !== undefined ? { price: change.price } : {}),
                ...(change.description !== undefined ? { description: change.description } : {}),
                _hasOverride: true,
              }
            : i,
        ),
      );
      toast.success("Menu item updated");
      setEditing(null);
    } else {
      toast.error("Save failed", "Try again.");
    }
  };

  // --- Derived ---
  const categories = useMemo(
    () => CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, search, category]);

  const grouped = useMemo(() => {
    const m = new Map<MenuCategory, MenuItemData[]>();
    for (const i of filtered) {
      const arr = m.get(i.category) || [];
      arr.push(i);
      m.set(i.category, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const unavailableCount = items.filter((i) => !i.available).length;

  const locOptions = activeLocations.map((l) => ({ value: l.slug, label: l.city }));

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Menu</h1>
          <p className="v2-page-subtitle">
            {items.length} items
            {unavailableCount > 0 && ` · ${unavailableCount} hidden from customers`}
          </p>
        </div>
        <div className="v2-page-actions">
          <div className="v2-field-inline">
            <MapPin className="h-3.5 w-3.5 v2-muted" />
            <Select
              value={pageLoc}
              onChange={(e) => setPageLoc(e.target.value)}
              options={locOptions}
              aria-label="Editing location"
            />
          </div>
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search items, descriptions, tags…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search menu"
          />
        </div>
        <Tabs
          value={category}
          onChange={(v) => setCategory(v as MenuCategory | "all")}
          tabs={[
            { value: "all", label: "All", count: items.length },
            ...categories.map((c) => ({
              value: c,
              label: MENU_CATEGORY_LABELS[c],
              count: items.filter((i) => i.category === c).length,
            })),
          ]}
          variant="pill"
          ariaLabel="Category filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading menu…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={UtensilsCrossed}
              title={items.length === 0 ? "No menu items" : "No matches"}
              description={
                items.length === 0
                  ? "Menu data lives in src/data/menus/*.ts. Add items there to see them here."
                  : "Clear the search or pick another category."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-mng-groups">
          {grouped.map(([cat, list]) => {
            const Icon = CATEGORY_ICON[cat];
            return (
              <section key={cat} className="v2-mng-section" data-variant="menu">
                <header className="v2-mng-section-header">
                  <span className="v2-mng-section-eyebrow">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="v2-mng-section-name">{MENU_CATEGORY_LABELS[cat]}</span>
                    <span className="v2-mng-section-count">{list.length}</span>
                  </span>
                  <span className="v2-mng-col">Price</span>
                  <span className="v2-mng-col">Cost</span>
                  <span className="v2-mng-col">Margin</span>
                  <span aria-hidden />
                </header>
                <ul className="v2-mng-list">
                  {list.map((item) => {
                    const margin = marginPct(item.price, item.cost);
                    return (
                      <li
                        key={item.id}
                        className={`v2-mng-row v2-mng-row-menu ${item.available ? "" : "is-off"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleAvailability(item)}
                          className={`v2-mng-toggle ${item.available ? "is-on" : "is-off"}`}
                          aria-label={item.available ? "Mark sold out" : "Mark available"}
                          title={item.available ? "Mark sold out" : "Mark available"}
                        >
                          {item.available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>

                        <div className="v2-mng-row-main">
                          <div className="v2-mng-row-headline">
                            <span className="v2-mng-row-name">{item.name}</span>
                            {item._hasOverride && (
                              <span className="v2-mng-tag v2-mng-tag-override">Overridden</span>
                            )}
                            {item.tags.map((t) => (
                              <span key={t} className="v2-mng-tag">{t}</span>
                            ))}
                          </div>
                          {item.description && <p className="v2-mng-row-desc">{item.description}</p>}
                        </div>

                        <span className="v2-mng-val v2-mng-val-price tabular">{formatPrice(item.price)}</span>
                        <span className="v2-mng-val v2-mng-val-cost tabular">{formatPrice(item.cost)}</span>
                        <span className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${marginTone(margin)} tabular`}>{margin}%</span>

                        <button
                          type="button"
                          className="v2-mng-edit"
                          onClick={() => setEditing(item)}
                          aria-label={`Edit ${item.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <EditItemDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </div>
  );
}

interface EditDialogProps {
  item: MenuItemData | null;
  onClose: () => void;
  onSave: (id: string, change: { price?: number; description?: string }) => Promise<void> | void;
}

function EditItemDialog({ item, onClose, onSave }: EditDialogProps) {
  const [priceStr, setPriceStr] = useState("0.00");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setPriceStr((item.price / 100).toFixed(2));
      setDesc(item.description);
      setBusy(false);
    }
  }, [item]);

  if (!item) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const submit = async () => {
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const change: { price?: number; description?: string } = {};
    if (price !== item.price) change.price = price;
    if (desc !== item.description) change.description = desc;
    if (Object.keys(change).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    await onSave(item.id, change);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Edit ${item.name}`}
      description="Changes apply to this location only via the override system. Reset by clearing the override in the database."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="Price (PLN)"
          type="number"
          step="0.01"
          min="0"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          trailingAdornment={<span className="v2-muted">zł</span>}
          description={`Food cost: ${formatPrice(item.cost)} · Current margin: ${marginPct(item.price, item.cost)}%`}
        />
        <Textarea
          label="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
        />
      </div>
    </Dialog>
  );
}
