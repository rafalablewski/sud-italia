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

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

const CATEGORY_ICON: Record<MenuCategory, LucideIcon> = {
  pizza: Pizza,
  pasta: UtensilsCrossed,
  antipasti: Salad,
  panini: Sandwich,
  drinks: Coffee,
  desserts: IceCream,
};

type MenuRole = "hero" | "profit-driver" | "anchor" | "lto";

interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  category: MenuCategory;
  tags: string[];
  available: boolean;
  // Audit §4.3 — surfaced from the merged item so the row can render a
  // role chip and the dialog can pre-fill the Pizzaiolo's-layout controls.
  menuRole?: MenuRole;
  isLimited?: boolean;
  limitedUntil?: string;
  // Audit §3 — channel economics, packaging, and per-item modifiers.
  deliveryOnly?: boolean;
  packagingCost?: number;
  modifierGroups?: ModifierGroup[];
  _hasOverride: boolean;
  _hasRecipe?: boolean;
  _costSource?: "recipe" | "override" | "seed";
}

const MENU_ROLE_LABEL: Record<MenuRole, string> = {
  hero: "Our Hero",
  "profit-driver": "Pizzaiolo's Choice",
  anchor: "Chef's Signature",
  lto: "Limited (LTO)",
};

const MENU_ROLE_OPTIONS: { value: ""; label: string }[] | { value: MenuRole | ""; label: string }[] = [
  { value: "", label: "No role (default)" },
  { value: "hero", label: "Hero — full-width gateway card" },
  { value: "profit-driver", label: "Pizzaiolo's Choice — gold profit-driver badge" },
  { value: "anchor", label: "Anchor — Chef's Signature, range-extender" },
  { value: "lto", label: "LTO — limited-time positioning" },
];

function daysUntilIso(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Editorial badge config from /admin/crosssell → Menu badges. Read-only
  // here; the row renders these chips next to the intrinsic menuRole tag so
  // the badge layout matches the customer view in one place.
  const [badgeSets, setBadgeSets] = useState<{
    hero: Set<string>;
    pizzaiolo: Set<string>;
    chef: Set<string>;
    popular: Set<string>;
    staffPick: Set<string>;
    new: Set<string>;
  }>({
    hero: new Set(),
    pizzaiolo: new Set(),
    chef: new Set(),
    popular: new Set(),
    staffPick: new Set(),
    new: new Set(),
  });

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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/upsell?location=${pageLoc}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setBadgeSets({
          hero: new Set<string>(cfg.heroItems ?? []),
          pizzaiolo: new Set<string>(cfg.pizzaioloChoiceItems ?? []),
          chef: new Set<string>(cfg.chefSignatureItems ?? []),
          popular: new Set<string>(cfg.popularItems ?? []),
          staffPick: new Set<string>(cfg.staffPicks ?? []),
          new: new Set<string>(cfg.newItems ?? []),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageLoc]);

  const persistChange = useCallback(
    async (
      id: string,
      change: {
        price?: number;
        available?: boolean;
        description?: string;
        menuRole?: MenuRole | null;
        isLimited?: boolean | null;
        limitedUntil?: string | null;
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
      price?: number;
      description?: string;
      menuRole?: MenuRole | null;
      isLimited?: boolean | null;
      limitedUntil?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    },
  ) => {
    const ok = await persistChange(id, change);
    if (ok) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(change.price !== undefined ? { price: change.price } : {}),
                ...(change.description !== undefined ? { description: change.description } : {}),
                // Apply null = clear / undefined = unchanged / value = set
                ...(change.menuRole !== undefined
                  ? { menuRole: change.menuRole === null ? undefined : change.menuRole }
                  : {}),
                ...(change.isLimited !== undefined
                  ? { isLimited: change.isLimited === null ? undefined : change.isLimited }
                  : {}),
                ...(change.limitedUntil !== undefined
                  ? { limitedUntil: change.limitedUntil === null ? undefined : change.limitedUntil }
                  : {}),
                ...(change.deliveryOnly !== undefined
                  ? { deliveryOnly: change.deliveryOnly === null ? undefined : change.deliveryOnly }
                  : {}),
                ...(change.packagingCost !== undefined
                  ? { packagingCost: change.packagingCost === null ? undefined : change.packagingCost }
                  : {}),
                ...(change.modifierGroups !== undefined
                  ? { modifierGroups: change.modifierGroups === null ? undefined : change.modifierGroups }
                  : {}),
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
                            {(() => {
                              // Effective role badges: union of intrinsic
                              // `menuRole` and the Menu badges tab selections.
                              // De-duped so the same item never shows two
                              // identical chips.
                              const isHero =
                                item.menuRole === "hero" ||
                                badgeSets.hero.has(item.id);
                              const isPizzaiolo =
                                item.menuRole === "profit-driver" ||
                                badgeSets.pizzaiolo.has(item.id);
                              const isChef =
                                item.menuRole === "anchor" ||
                                badgeSets.chef.has(item.id);
                              return (
                                <>
                                  {isHero && (
                                    <span
                                      className="v2-mng-tag v2-mng-tag-hero"
                                      title="Menu badge: Our Hero"
                                    >
                                      {MENU_ROLE_LABEL.hero}
                                    </span>
                                  )}
                                  {isPizzaiolo && (
                                    <span
                                      className="v2-mng-tag v2-mng-tag-pizzaiolo"
                                      title="Menu badge: Pizzaiolo's Choice"
                                    >
                                      {MENU_ROLE_LABEL["profit-driver"]}
                                    </span>
                                  )}
                                  {isChef && (
                                    <span
                                      className="v2-mng-tag v2-mng-tag-anchor"
                                      title="Menu badge: Chef's Signature"
                                    >
                                      {MENU_ROLE_LABEL.anchor}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                            {item.isLimited && (() => {
                              const d = daysUntilIso(item.limitedUntil);
                              return (
                                <span
                                  className="v2-mng-tag v2-mng-tag-lto"
                                  title={
                                    item.limitedUntil
                                      ? `LTO ends ${item.limitedUntil}`
                                      : "Limited-time item (no end date)"
                                  }
                                >
                                  {d !== null ? `LTO · ${d}d left` : "LTO"}
                                </span>
                              );
                            })()}
                            {badgeSets.popular.has(item.id) && (
                              <span
                                className="v2-mng-tag v2-mng-tag-popular"
                                title="Menu badge: Most Popular"
                              >
                                Popular
                              </span>
                            )}
                            {badgeSets.staffPick.has(item.id) && (
                              <span
                                className="v2-mng-tag v2-mng-tag-staffpick"
                                title="Menu badge: Staff Pick"
                              >
                                Staff Pick
                              </span>
                            )}
                            {badgeSets.new.has(item.id) && (
                              <span
                                className="v2-mng-tag v2-mng-tag-new"
                                title="Menu badge: New"
                              >
                                New
                              </span>
                            )}
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
                        <span
                          className="v2-mng-val v2-mng-val-cost tabular"
                          title={item._hasRecipe ? "Cost is computed from this item's recipe (canonical)." : item._costSource === "override" ? "Cost is a manual override." : "Cost is the seed value — no recipe yet."}
                        >
                          {formatPrice(item.cost)}
                          {item._hasRecipe && <span className="v2-mng-cost-source"> recipe</span>}
                        </span>
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
  onSave: (
    id: string,
    change: {
      price?: number;
      description?: string;
      menuRole?: MenuRole | null;
      isLimited?: boolean | null;
      limitedUntil?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    },
  ) => Promise<void> | void;
}

function EditItemDialog({ item, onClose, onSave }: EditDialogProps) {
  const [priceStr, setPriceStr] = useState("0.00");
  const [desc, setDesc] = useState("");
  const [roleStr, setRoleStr] = useState<MenuRole | "">("");
  const [isLimited, setIsLimited] = useState(false);
  const [limitedUntil, setLimitedUntil] = useState("");
  // Audit §3 channel + packaging + modifiers
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [packagingStr, setPackagingStr] = useState("");
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setPriceStr((item.price / 100).toFixed(2));
      setDesc(item.description);
      setRoleStr(item.menuRole ?? "");
      setIsLimited(Boolean(item.isLimited));
      setLimitedUntil(item.limitedUntil ?? "");
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

  const submit = async () => {
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const change: {
      price?: number;
      description?: string;
      menuRole?: MenuRole | null;
      isLimited?: boolean | null;
      limitedUntil?: string | null;
      deliveryOnly?: boolean | null;
      packagingCost?: number | null;
      modifierGroups?: ModifierGroup[] | null;
    } = {};
    if (price !== item.price) change.price = price;
    if (desc !== item.description) change.description = desc;
    // Compare against the merged-display value. `null` signals "clear the
    // override so the field disappears from the public card"; the API
    // schema treats null and undefined differently.
    const nextRole: MenuRole | null = roleStr === "" ? null : roleStr;
    if (nextRole !== (item.menuRole ?? null)) change.menuRole = nextRole;
    const nextLimited: boolean | null = isLimited ? true : null;
    if (nextLimited !== (item.isLimited ?? null)) change.isLimited = nextLimited;
    const nextUntil: string | null = limitedUntil.trim() === "" ? null : limitedUntil.trim();
    if (nextUntil !== (item.limitedUntil ?? null)) change.limitedUntil = nextUntil;
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
    await onSave(item.id, change);
    setBusy(false);
  };

  const ltoCountdown = daysUntilIso(limitedUntil);

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
        <Select
          label="Menu engineering role (audit §4.3)"
          value={roleStr}
          onChange={(e) => setRoleStr(e.target.value as MenuRole | "")}
          options={MENU_ROLE_OPTIONS as { value: string; label: string }[]}
          description={
            roleStr === "hero"
              ? "Renders as a full-width gateway card with the red Our Hero ribbon."
              : roleStr === "profit-driver"
                ? "Gets the gold Pizzaiolo's Choice badge — high-GM upsell positioning."
                : roleStr === "anchor"
                  ? "Dark Chef's Signature treatment — range-extends the rest of the category."
                  : roleStr === "lto"
                    ? "Limited-time positioning — pair with the LTO toggle below for the countdown chip."
                    : "No special treatment — sorted by popularity within the category."
          }
        />
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
            id={`lto-toggle-${item.id}`}
            type="checkbox"
            checked={isLimited}
            onChange={(e) => setIsLimited(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor={`lto-toggle-${item.id}`} style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Limited-time item (LTO)
          </label>
          <span style={{ gridColumn: "1 / 3" }}>
            <Input
              type="date"
              label="Available until"
              value={limitedUntil}
              onChange={(e) => setLimitedUntil(e.target.value)}
              disabled={!isLimited}
              description={
                isLimited && ltoCountdown !== null
                  ? `Customer sees a "${ltoCountdown}d left" countdown chip on the card.`
                  : isLimited
                    ? "Leave blank for an open-ended limited run (no countdown shown)."
                    : "Enable the LTO toggle to set a date."
              }
            />
          </span>
        </div>

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
