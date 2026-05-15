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
        available?: boolean;
        description?: string;
        menuRole?: MenuRole | null;
        isLimited?: boolean | null;
        limitedUntil?: string | null;
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
                            {item.menuRole && (
                              <span
                                className={`v2-mng-tag v2-mng-tag-${item.menuRole === "profit-driver" ? "pizzaiolo" : item.menuRole}`}
                                title={`Menu engineering role: ${MENU_ROLE_LABEL[item.menuRole]}`}
                              >
                                {MENU_ROLE_LABEL[item.menuRole]}
                              </span>
                            )}
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
    },
  ) => Promise<void> | void;
}

function EditItemDialog({ item, onClose, onSave }: EditDialogProps) {
  const [priceStr, setPriceStr] = useState("0.00");
  const [desc, setDesc] = useState("");
  const [roleStr, setRoleStr] = useState<MenuRole | "">("");
  const [isLimited, setIsLimited] = useState(false);
  const [limitedUntil, setLimitedUntil] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setPriceStr((item.price / 100).toFixed(2));
      setDesc(item.description);
      setRoleStr(item.menuRole ?? "");
      setIsLimited(Boolean(item.isLimited));
      setLimitedUntil(item.limitedUntil ?? "");
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
      </div>
    </Dialog>
  );
}
