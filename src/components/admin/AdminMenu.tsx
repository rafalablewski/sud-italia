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
  Plus,
  Salad,
  Sandwich,
  Search,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { MENU_CATEGORY_LABELS, type MenuCategory, type ModifierGroup, type ModifierOption } from "@/data/types";
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

const MENU_TAGS: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[] = [
  "vegetarian",
  "vegan",
  "spicy",
  "gluten-free",
];

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
  /** Operator-facing inventory / accounting code (audit §4.3). */
  sku?: string;
  // Audit §3 — channel economics, packaging, and per-item modifiers.
  deliveryOnly?: boolean;
  packagingCost?: number;
  modifierGroups?: ModifierGroup[];
  _hasOverride: boolean;
  _hasRecipe?: boolean;
  _costSource?: "recipe" | "override" | "seed";
  /** Admin-created items (vs seed) — surfaces a delete button and routes
   *  edits to the custom-item endpoint instead of the override endpoint. */
  _isCustom?: boolean;
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
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
    async (
      id: string,
      change: {
        price?: number;
        cost?: number;
        available?: boolean;
        name?: string;
        description?: string;
        category?: MenuCategory | null;
        tags?: string[] | null;
        sku?: string | null;
        deliveryOnly?: boolean | null;
        packagingCost?: number | null;
        modifierGroups?: ModifierGroup[] | null;
      },
    ) => {
      const res = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: { [id]: change } }),
      });
      return res.ok;
    },
    [],
  );

  /** Custom-item edits hit a different endpoint — they aren't overrides,
   *  they're the canonical row. Returns the updated record or null on
   *  failure so the caller can surface a toast. */
  const persistCustomChange = useCallback(
    async (
      id: string,
      change: {
        name?: string;
        description?: string;
        price?: number;
        cost?: number;
        category?: MenuCategory;
        tags?: string[];
        available?: boolean;
        sku?: string;
        deliveryOnly?: boolean;
        packagingCost?: number;
        modifierGroups?: ModifierGroup[];
      },
    ) => {
      const res = await fetch(`/api/admin/menu/custom?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
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

  const bulkSetAvailability = async (available: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const updates: Record<string, { available: boolean }> = {};
      for (const id of selectedIds) updates[id] = { available };
      const res = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updates }),
      });
      if (res.ok) {
        setItems((arr) =>
          arr.map((i) => (selectedIds.has(i.id) ? { ...i, available, _hasOverride: true } : i)),
        );
        toast.success(
          available ? "Items marked available" : "Items 86'd",
          `${selectedIds.size} ${selectedIds.size === 1 ? "item" : "items"} updated.`,
        );
        setSelectedIds(new Set());
      } else {
        toast.error("Could not bulk update");
      }
    } finally {
      setBulkBusy(false);
    }
  };

  /** Reverts the selected items to their static seed values by dropping
   *  any override row. Used by the "Reset overrides" bulk action. */
  const bulkResetOverrides = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const res = await fetch("/api/admin/menu/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", ids }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          "Overrides reset",
          `${data.affected} item${data.affected === 1 ? "" : "s"} reverted to seed values.`,
        );
        setSelectedIds(new Set());
        await fetchMenu();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not reset", data?.error);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  /** Copies the selected items' price/cost/description overrides to the
   *  matching items in another location, matched by name. */
  const bulkCloneToLocation = async (targetSlug: string) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const res = await fetch("/api/admin/menu/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clone_to", ids, target: targetSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        const targetLabel =
          activeLocations.find((l) => l.slug === targetSlug)?.city ?? targetSlug;
        const msg = data.unmatched > 0
          ? `${data.matched} cloned to ${targetLabel} · ${data.unmatched} skipped (no matching name).`
          : `${data.matched} cloned to ${targetLabel}.`;
        if (data.matched > 0) {
          toast.success("Cloned across locations", msg);
        } else {
          toast.warning("Nothing cloned", msg);
        }
        setSelectedIds(new Set());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not clone", data?.error);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveEdit = async (
    id: string,
    change: {
      name?: string;
      price?: number;
      cost?: number;
      description?: string;
      category?: MenuCategory;
      tags?: string[];
      available?: boolean;
      sku?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    },
    isCustom: boolean,
  ) => {
    let ok = false;
    if (isCustom) {
      // Custom rows store the canonical state directly — the override
      // pipeline's `null = clear back to seed` sentinel doesn't apply
      // (there's no seed). Translate it to the concrete "off / empty"
      // value for each field so unchecking a toggle in the dialog
      // actually persists.
      const customChange = {
        ...(change.name !== undefined ? { name: change.name } : {}),
        ...(change.description !== undefined ? { description: change.description } : {}),
        ...(change.price !== undefined ? { price: change.price } : {}),
        ...(change.cost !== undefined ? { cost: change.cost } : {}),
        ...(change.category !== undefined ? { category: change.category } : {}),
        ...(change.tags !== undefined ? { tags: change.tags } : {}),
        ...(change.available !== undefined ? { available: change.available } : {}),
        ...(change.sku !== undefined ? { sku: change.sku ?? "" } : {}),
        ...(change.deliveryOnly !== undefined
          ? { deliveryOnly: change.deliveryOnly ?? false }
          : {}),
        ...(change.packagingCost !== undefined
          ? { packagingCost: change.packagingCost ?? 0 }
          : {}),
        ...(change.modifierGroups !== undefined
          ? { modifierGroups: change.modifierGroups ?? [] }
          : {}),
      };
      ok = await persistCustomChange(id, customChange);
    } else {
      // Seed items go through the override pipeline. Every field is
      // override-able now (category, tags, sku, cost included) so the
      // edit form is consistent regardless of storage backend.
      ok = await persistChange(id, change);
    }

    if (ok) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(change.name !== undefined ? { name: change.name } : {}),
                ...(change.price !== undefined ? { price: change.price } : {}),
                ...(change.cost !== undefined ? { cost: change.cost } : {}),
                ...(change.description !== undefined ? { description: change.description } : {}),
                ...(change.category !== undefined ? { category: change.category } : {}),
                ...(change.tags !== undefined ? { tags: change.tags } : {}),
                ...(change.available !== undefined ? { available: change.available } : {}),
                ...(change.sku !== undefined
                  ? { sku: change.sku === null ? undefined : change.sku }
                  : {}),
                // Apply null = clear / undefined = unchanged / value = set
                ...(change.deliveryOnly !== undefined
                  ? { deliveryOnly: change.deliveryOnly === null ? undefined : change.deliveryOnly }
                  : {}),
                ...(change.packagingCost !== undefined
                  ? { packagingCost: change.packagingCost === null ? undefined : change.packagingCost }
                  : {}),
                ...(change.modifierGroups !== undefined
                  ? { modifierGroups: change.modifierGroups === null ? undefined : change.modifierGroups }
                  : {}),
                _hasOverride: isCustom ? i._hasOverride : true,
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

  const createCustomItem = async (draft: {
    baseSlug: string;
    name: string;
    description: string;
    price: number;
    cost: number;
    category: MenuCategory;
    tags: string[];
    available: boolean;
    sku?: string;
    locationSlugs: string[];
  }) => {
    // Each target location gets its own row + globally-unique id (the
    // POST endpoint rejects id collisions across seed + custom rows so
    // the merge in getMenuWithOverrides() stays deterministic). We
    // generate `${locPrefix}-${baseSlug}` per location.
    const targets = draft.locationSlugs.length > 0 ? draft.locationSlugs : [pageLoc];
    const failures: { slug: string; error: string }[] = [];
    for (const slug of targets) {
      const prefix = slug.slice(0, 3) || "loc";
      const id = `${prefix}-${draft.baseSlug}`;
      const body = {
        id,
        locationSlug: slug,
        name: draft.name,
        description: draft.description,
        price: draft.price,
        cost: draft.cost,
        category: draft.category,
        tags: draft.tags,
        available: draft.available,
        ...(draft.sku ? { sku: draft.sku } : {}),
      };
      const res = await fetch("/api/admin/menu/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        failures.push({ slug, error: err?.error || `HTTP ${res.status}` });
      }
    }

    if (failures.length === targets.length) {
      const first = failures[0];
      toast.error("Could not create item", first.error);
      return false;
    }
    if (failures.length > 0) {
      const names = failures
        .map((f) => activeLocations.find((l) => l.slug === f.slug)?.city ?? f.slug)
        .join(", ");
      toast.warning(
        "Item partially created",
        `${targets.length - failures.length} of ${targets.length} locations saved. Failed: ${names}.`,
      );
    } else {
      const successCount = targets.length;
      toast.success(
        "Item added",
        successCount > 1
          ? `${draft.name} created at ${successCount} locations.`
          : draft.name,
      );
    }
    setCreating(false);
    await fetchMenu();
    return true;
  };

  const deleteCustomItem = async (item: MenuItemData) => {
    if (!item._isCustom) return;
    if (
      !confirm(
        `Delete "${item.name}"? This removes the item from the customer menu permanently.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/menu/custom?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error("Could not delete", err?.error || "Try again.");
      return;
    }
    setItems((arr) => arr.filter((i) => i.id !== item.id));
    toast.success("Item removed", item.name);
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
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add item
          </Button>
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

      {selectedIds.size > 0 && (
        <div
          style={{
            position: "sticky",
            top: "0.5rem",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "0.5rem 0.75rem",
            margin: "0 0 0.5rem",
            borderRadius: "0.5rem",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
            {selectedIds.size} selected
          </span>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkSetAvailability(true)}>
              Mark available
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkSetAvailability(false)}>
              86 (hide)
            </Button>
            {activeLocations
              .filter((l) => l.slug !== pageLoc)
              .map((l) => (
                <Button
                  key={l.slug}
                  size="sm"
                  variant="ghost"
                  disabled={bulkBusy}
                  onClick={() => bulkCloneToLocation(l.slug)}
                  title={`Copy the selected items' price / cost / description overrides to matching items in ${l.city}.`}
                >
                  Clone → {l.city}
                </Button>
              ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy}
              onClick={bulkResetOverrides}
              title="Drop any custom price / cost / description / availability for the selected items — reverts to seed values."
            >
              Reset overrides
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

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
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <li
                        key={item.id}
                        className={`v2-mng-row v2-mng-row-menu ${item.available ? "" : "is-off"}`}
                        style={isSelected ? { background: "var(--brand-soft)" } : undefined}
                      >
                        <input
                          type="checkbox"
                          className="v2-mng-select"
                          checked={isSelected}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={isSelected ? `Deselect ${item.name}` : `Select ${item.name}`}
                        />
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
                            {/* Editorial / menu-engineering badges (Hero,
                                Pizzaiolo's Choice, Chef's Signature, Popular,
                                Staff Pick, New, LTO) are managed and shown
                                solely from /admin/crosssell → Menu badges.
                                The admin menu row keeps only the override
                                state indicator and intrinsic recipe tags.
                                The "Custom" badge was retired — every item
                                is fully editable, so the storage origin no
                                longer warrants a visual distinction. */}
                            {item._hasOverride && (
                              <span className="v2-mng-tag v2-mng-tag-override">Edited</span>
                            )}
                            {item.sku && (
                              <span className="v2-mng-tag" title="SKU / inventory code">
                                {item.sku}
                              </span>
                            )}
                            {item.tags.map((t) => (
                              <span key={t} className="v2-mng-tag">{t}</span>
                            ))}
                          </div>
                          {item.description && <p className="v2-mng-row-desc">{item.description}</p>}
                        </div>

                        <span className="v2-mng-val v2-mng-val-price tabular">{formatPrice(item.price)}</span>
                        <span
                          className="v2-mng-val v2-mng-val-cost tabular"
                          title={item._hasRecipe ? "Cost is computed from this item's recipe (canonical)." : item._costSource === "override" ? "Cost is a manual override." : "Cost is the seed value — no recipe yet."}
                        >
                          {formatPrice(item.cost)}
                          {item._hasRecipe && <span className="v2-mng-cost-source"> recipe</span>}
                        </span>
                        <span className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${marginTone(margin)} tabular`}>{margin}%</span>

                        <span className="v2-mng-edit-group">
                          <button
                            type="button"
                            className="v2-mng-edit"
                            onClick={() => setEditing(item)}
                            aria-label={`Edit ${item.name}`}
                            title="Edit item"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {item._isCustom && (
                            <button
                              type="button"
                              className="v2-mng-edit v2-mng-edit-danger"
                              onClick={() => deleteCustomItem(item)}
                              aria-label={`Delete ${item.name}`}
                              title="Delete item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
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

      <CreateItemDialog
        open={creating}
        locationSlug={pageLoc}
        onClose={() => setCreating(false)}
        onCreate={createCustomItem}
      />
    </div>
  );
}

interface EditDialogProps {
  item: MenuItemData | null;
  onClose: () => void;
  onSave: (
    id: string,
    change: {
      name?: string;
      price?: number;
      cost?: number;
      description?: string;
      category?: MenuCategory;
      tags?: string[];
      available?: boolean;
      sku?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    },
    isCustom: boolean,
  ) => Promise<void> | void;
}

function EditItemDialog({ item, onClose, onSave }: EditDialogProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [priceStr, setPriceStr] = useState("0.00");
  const [costStr, setCostStr] = useState("0.00");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<MenuCategory>("pizza");
  const [tags, setTags] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  // Audit §3 channel + packaging + modifiers
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [packagingStr, setPackagingStr] = useState("");
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setSku(item.sku ?? "");
      setPriceStr((item.price / 100).toFixed(2));
      setCostStr((item.cost / 100).toFixed(2));
      setDesc(item.description);
      setCat(item.category);
      setTags(item.tags.slice());
      setAvailable(item.available);
      setDeliveryOnly(Boolean(item.deliveryOnly));
      setPackagingStr(
        typeof item.packagingCost === "number"
          ? (item.packagingCost / 100).toFixed(2)
          : "",
      );
      // Deep clone so dialog edits don't mutate the parent state.
      setModifierGroups(
        item.modifierGroups
          ? JSON.parse(JSON.stringify(item.modifierGroups))
          : [],
      );
      setBusy(false);
    }
  }, [item]);

  if (!item) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const isCustom = Boolean(item._isCustom);
  // Recipe-attached items get their cost computed from ingredients, so the
  // field is locked regardless of whether the row is seed or custom.
  const canEditCost = !item._hasRecipe;

  const submit = async () => {
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const change: {
      name?: string;
      price?: number;
      cost?: number;
      description?: string;
      category?: MenuCategory;
      tags?: string[];
      available?: boolean;
      sku?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    } = {};
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== item.name) change.name = trimmedName;
    if (price !== item.price) change.price = price;
    if (canEditCost) {
      const cost = Math.round(parseFloat(costStr || "0") * 100);
      if (cost !== item.cost) change.cost = cost;
    }
    if (desc !== item.description) change.description = desc;
    if (cat !== item.category) change.category = cat;
    const tagsChanged =
      tags.length !== item.tags.length || tags.some((t) => !item.tags.includes(t));
    if (tagsChanged) change.tags = tags;
    if (available !== item.available) change.available = available;
    const trimmedSku = sku.trim();
    if (trimmedSku !== (item.sku ?? "")) {
      // For seed-backed items, empty string -> null clears the override
      // back to the seed sku. Custom items just store the empty string.
      change.sku = trimmedSku === "" ? (isCustom ? "" : null) : trimmedSku;
    }
    const nextDeliveryOnly: boolean | null = deliveryOnly ? true : null;
    if (nextDeliveryOnly !== (item.deliveryOnly ?? null)) {
      change.deliveryOnly = nextDeliveryOnly;
    }
    const packagingRaw = packagingStr.trim();
    const nextPackaging: number | null =
      packagingRaw === ""
        ? null
        : Math.max(0, Math.round(parseFloat(packagingRaw || "0") * 100));
    if (nextPackaging !== (item.packagingCost ?? null)) {
      change.packagingCost = nextPackaging;
    }
    // Modifier comparison via JSON equality — admins editing options
    // re-render the array reference, so identity check would always fire.
    const cleanedGroups = modifierGroups
      .filter((g) => g.label.trim().length > 0 && g.options.length > 0)
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.label.trim().length > 0),
      }))
      .filter((g) => g.options.length > 0);
    const seedGroups = item.modifierGroups ?? [];
    if (JSON.stringify(cleanedGroups) !== JSON.stringify(seedGroups)) {
      change.modifierGroups = cleanedGroups.length === 0 ? null : cleanedGroups;
    }

    if (Object.keys(change).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    await onSave(item.id, change, isCustom);
    setBusy(false);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Edit ${item.name}`}
      description="Changes apply to this location only. Save to publish."
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
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          description="Customer-facing item name."
        />
        <Input
          label="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="e.g. SI-PIZ-MARG-001"
          description="Operator-facing inventory / accounting code. Leave blank if not tracked."
        />
        <Select
          label="Category"
          value={cat}
          onChange={(e) => setCat(e.target.value as MenuCategory)}
          options={CATEGORY_ORDER.map((c) => ({
            value: c,
            label: MENU_CATEGORY_LABELS[c],
          }))}
        />
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
        <Input
          label="Food cost (PLN)"
          type="number"
          step="0.01"
          min="0"
          value={costStr}
          onChange={(e) => setCostStr(e.target.value)}
          disabled={!canEditCost}
          trailingAdornment={<span className="v2-muted">zł</span>}
          description={
            canEditCost
              ? "Per-portion plate cost. Once a recipe is attached this becomes computed automatically and the field is locked."
              : "Computed from the attached recipe. Edit ingredients in /admin/recipes to change."
          }
        />
        <Textarea
          label="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
        />
        <div className="v2-field">
          <label className="v2-field-label">Tags</label>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {MENU_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  className={`v2-chip ${on ? "is-on" : ""}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <p className="v2-field-desc">
            Optional dietary markers shown on the menu card.
          </p>
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--text-sm)",
          }}
        >
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          Available to customers
        </label>
        {/* Menu-engineering role + LTO live in /admin/crosssell → Menu badges
            so the editorial chips have one source of truth. The per-item
            edit dialog stays focused on price, description, channel
            economics, and modifiers. */}

        {/* Audit §3 — channel economics + packaging cost */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.5rem 0.75rem",
            alignItems: "center",
            padding: "0.625rem 0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
          }}
        >
          <input
            id={`delivery-only-${item.id}`}
            type="checkbox"
            checked={deliveryOnly}
            onChange={(e) => setDeliveryOnly(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor={`delivery-only-${item.id}`} style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Delivery-only item
          </label>
          <span style={{ gridColumn: "1 / 3", fontSize: "0.75rem", color: "var(--fg-muted)" }}>
            When on, the item is hidden from dine-in/takeout carts and only
            appears when fulfillmentType=&quot;delivery&quot;. Use for pantry
            SKUs (frozen tiramisù, beer 4-pack, olive oil bottle) that
            customers can&apos;t carry from a truck.
          </span>
          <span style={{ gridColumn: "1 / 3" }}>
            <Input
              type="number"
              step="0.01"
              min="0"
              label="Packaging cost (PLN, optional)"
              value={packagingStr}
              onChange={(e) => setPackagingStr(e.target.value)}
              trailingAdornment={<span className="v2-muted">zł</span>}
              description="Per-unit box / wrap / napkin cost on delivery orders. Leave blank to use the category default (pizza 1.80 / pasta 2.50 / antipasti 1.50 / panini 0.80 / drinks 0.60 / desserts 1.00)."
            />
          </span>
        </div>

        {/* Audit §3 — per-item modifier editor */}
        <ModifierEditor groups={modifierGroups} onChange={setModifierGroups} />
      </div>
    </Dialog>
  );
}

// ─── Modifier editor (audit §3) ──────────────────────────────────────────
//
// Lets an operator add/edit modifier groups for a menu item: crust types,
// premium toppings, spice levels. Each group has a label, min/max
// selection bounds, and an option list. Options carry priceDelta (added
// to the line price), optional costDelta (used by the bundle margin
// alert), and a flagOnKds boolean that highlights the option on the
// kitchen ticket.
//
// Default off — items without modifier groups stay legacy single-price.

function ModifierEditor({
  groups,
  onChange,
}: {
  groups: ModifierGroup[];
  onChange: (next: ModifierGroup[]) => void;
}) {
  const update = (i: number, patch: Partial<ModifierGroup>) => {
    onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  };
  const remove = (i: number) => {
    onChange(groups.filter((_, idx) => idx !== i));
  };
  const add = () => {
    const id = `mod-${Math.random().toString(36).slice(2, 8)}`;
    onChange([
      ...groups,
      {
        id,
        label: "New group",
        minSelections: 0,
        maxSelections: 1,
        options: [{ id: `opt-${Math.random().toString(36).slice(2, 8)}`, label: "Standard", priceDelta: 0 }],
      },
    ]);
  };
  const updateOption = (gi: number, oi: number, patch: Partial<ModifierOption>) => {
    update(gi, {
      options: groups[gi].options.map((o, idx) => (idx === oi ? { ...o, ...patch } : o)),
    });
  };
  const addOption = (gi: number) => {
    update(gi, {
      options: [
        ...groups[gi].options,
        {
          id: `opt-${Math.random().toString(36).slice(2, 8)}`,
          label: "New option",
          priceDelta: 0,
        },
      ],
    });
  };
  const removeOption = (gi: number, oi: number) => {
    update(gi, {
      options: groups[gi].options.filter((_, idx) => idx !== oi),
    });
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "0.75rem",
        background: "var(--surface-2)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Item modifiers</p>
          <p style={{ fontSize: "0.75rem", color: "var(--fg-muted)", marginTop: "0.125rem" }}>
            Optional groups customers pick from at checkout. PriceDelta adds
            to the line; flagOnKds highlights on the kitchen ticket.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={add}>
          + Add group
        </Button>
      </div>

      {groups.length === 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--fg-muted)", fontStyle: "italic" }}>
          No modifier groups. Customers see the standard price only.
        </p>
      )}

      {groups.map((g, gi) => (
        <div
          key={g.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.625rem",
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "0.5rem" }}>
            <Input
              label="Group label"
              value={g.label}
              onChange={(e) => update(gi, { label: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              max={10}
              label="Min picks"
              value={String(g.minSelections ?? 0)}
              onChange={(e) =>
                update(gi, { minSelections: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <Input
              type="number"
              min={1}
              max={10}
              label="Max picks"
              value={String(g.maxSelections ?? 1)}
              onChange={(e) =>
                update(gi, { maxSelections: Math.max(1, Number(e.target.value) || 1) })
              }
            />
            <div style={{ alignSelf: "end" }}>
              <Button size="sm" variant="ghost" onClick={() => remove(gi)}>
                Remove group
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {g.options.map((o, oi) => (
              <div
                key={o.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr auto auto",
                  gap: "0.375rem",
                  alignItems: "center",
                }}
              >
                <Input
                  label={oi === 0 ? "Option label" : undefined}
                  value={o.label}
                  onChange={(e) => updateOption(gi, oi, { label: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  label={oi === 0 ? "Price +zł" : undefined}
                  value={(o.priceDelta / 100).toFixed(2)}
                  onChange={(e) =>
                    updateOption(gi, oi, {
                      priceDelta: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  label={oi === 0 ? "Cost +zł" : undefined}
                  value={typeof o.costDelta === "number" ? (o.costDelta / 100).toFixed(2) : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updateOption(gi, oi, {
                      costDelta:
                        raw === ""
                          ? undefined
                          : Math.max(0, Math.round(parseFloat(raw) * 100)),
                    });
                  }}
                />
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--fg-muted)",
                    whiteSpace: "nowrap",
                  }}
                  title="Highlight this option on the KDS ticket so the line spots it at a glance."
                >
                  <input
                    type="checkbox"
                    checked={!!o.flagOnKds}
                    onChange={(e) => updateOption(gi, oi, { flagOnKds: e.target.checked || undefined })}
                  />
                  KDS
                </label>
                <Button size="sm" variant="ghost" onClick={() => removeOption(gi, oi)}>
                  ×
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => addOption(gi)}>
              + Add option
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create-item dialog ───────────────────────────────────────────────────
//
// Spins up a brand-new admin-managed menu item. Operators pick one, two,
// or all active locations and the dialog issues one POST per location with
// a per-location id derived from the location slug prefix. IDs are
// validated server-side against both the seed catalogue and other custom
// rows so the merge in getMenuWithOverrides() stays deterministic.

function baseSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

interface CreateItemDialogProps {
  open: boolean;
  locationSlug: string;
  onClose: () => void;
  onCreate: (draft: {
    baseSlug: string;
    name: string;
    description: string;
    price: number;
    cost: number;
    category: MenuCategory;
    tags: string[];
    available: boolean;
    sku?: string;
    locationSlugs: string[];
  }) => Promise<boolean>;
}

function CreateItemDialog({ open, locationSlug, onClose, onCreate }: CreateItemDialogProps) {
  const [name, setName] = useState("");
  const [baseSlug, setBaseSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [desc, setDesc] = useState("");
  const [sku, setSku] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [costStr, setCostStr] = useState("");
  const [cat, setCat] = useState<MenuCategory>("pizza");
  const [tags, setTags] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [selectedLocs, setSelectedLocs] = useState<string[]>([locationSlug]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setBaseSlug("");
      setSlugTouched(false);
      setDesc("");
      setSku("");
      setPriceStr("");
      setCostStr("");
      setCat("pizza");
      setTags([]);
      setAvailable(true);
      setSelectedLocs([locationSlug]);
      setError(null);
      setBusy(false);
    }
  }, [open, locationSlug]);

  // Auto-derive the base slug from the typed name until the operator
  // manually edits it. The base slug is location-agnostic — each target
  // location prepends its own 3-char prefix when the row is created.
  useEffect(() => {
    if (!slugTouched) setBaseSlug(baseSlugFromName(name));
  }, [name, slugTouched]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const toggleLoc = (slug: string) => {
    setSelectedLocs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const allSelected = selectedLocs.length === activeLocations.length;
  const selectAll = () => {
    if (allSelected) {
      setSelectedLocs([locationSlug]);
    } else {
      setSelectedLocs(activeLocations.map((l) => l.slug));
    }
  };

  const idPreview = selectedLocs
    .map((s) => `${s.slice(0, 3) || "loc"}-${baseSlug}`)
    .join(", ");

  const submit = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedSlug = baseSlug.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (selectedLocs.length === 0) {
      setError("Select at least one location.");
      return;
    }
    // Per-location id is `${prefix}-${baseSlug}`. The full id must pass
    // the server regex (3–60 chars, lowercase + hyphens + digits). The
    // shortest active prefix is 3 chars (krk/war/...), so a single-char
    // base would still pass — guard at the source instead.
    if (!/^[a-z0-9-]{1,40}$/.test(trimmedSlug) || trimmedSlug.length < 1) {
      setError("Item slug must be 1–40 chars, lowercase letters, digits, and hyphens only.");
      return;
    }
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const cost = Math.round(parseFloat(costStr || "0") * 100);
    if (price <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    if (cost < 0) {
      setError("Food cost cannot be negative.");
      return;
    }
    const trimmedSku = sku.trim();
    if (trimmedSku.length > 60) {
      setError("SKU must be 60 characters or fewer.");
      return;
    }
    setBusy(true);
    const ok = await onCreate({
      baseSlug: trimmedSlug,
      name: trimmedName,
      description: desc.trim(),
      price,
      cost,
      category: cat,
      tags,
      available,
      ...(trimmedSku ? { sku: trimmedSku } : {}),
      locationSlugs: selectedLocs,
    });
    setBusy(false);
    if (!ok) {
      // onCreate surfaces a toast — keep dialog open so the operator can fix
      // whatever the server flagged.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Add menu item"
      description="Pick one or more locations — each gets its own row with a location-prefixed id."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create item
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        {error && (
          <div className="alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="v2-field">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
            }}
          >
            <label className="v2-field-label">Locations</label>
            <button
              type="button"
              onClick={selectAll}
              className="v2-chip"
              aria-pressed={allSelected}
            >
              {allSelected ? "Clear" : "All locations"}
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {activeLocations.map((loc) => {
              const on = selectedLocs.includes(loc.slug);
              return (
                <button
                  key={loc.slug}
                  type="button"
                  onClick={() => toggleLoc(loc.slug)}
                  aria-pressed={on}
                  className={`v2-chip ${on ? "is-on" : ""}`}
                >
                  {loc.city}
                </button>
              );
            })}
          </div>
          <p className="v2-field-desc">
            Each selected location gets a separate row scoped to that truck.
            Toggle later via /admin/menu per-location.
          </p>
        </div>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pizza Capricciosa"
        />
        <Input
          label="Item slug"
          value={baseSlug}
          onChange={(e) => {
            setBaseSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            setSlugTouched(true);
          }}
          description={
            baseSlug
              ? `Will create: ${idPreview}`
              : "Stable identifier used in orders + analytics. Auto-derived from the name."
          }
        />
        <Input
          label="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="e.g. SI-PIZ-CAPR-001"
          description="Operator-facing inventory / accounting code (optional). Same SKU is applied to every selected location."
        />
        <Select
          label="Category"
          value={cat}
          onChange={(e) => setCat(e.target.value as MenuCategory)}
          options={CATEGORY_ORDER.map((c) => ({
            value: c,
            label: MENU_CATEGORY_LABELS[c],
          }))}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <Input
            label="Price (PLN)"
            type="number"
            step="0.01"
            min="0"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            trailingAdornment={<span className="v2-muted">zł</span>}
          />
          <Input
            label="Food cost (PLN)"
            type="number"
            step="0.01"
            min="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            trailingAdornment={<span className="v2-muted">zł</span>}
          />
        </div>
        <Textarea
          label="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="What's in the dish, where the ingredients come from."
        />
        <div className="v2-field">
          <label className="v2-field-label">Tags</label>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {MENU_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  className={`v2-chip ${on ? "is-on" : ""}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--text-sm)",
          }}
        >
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          Available to customers immediately
        </label>
      </div>
    </Dialog>
  );
}
