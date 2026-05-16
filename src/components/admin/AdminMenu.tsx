"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  /** Soft-deleted seed rows surfaced for the admin "Show hidden" toggle.
   *  Filtered out of customer surfaces by getMenuWithOverrides(). */
  _hidden?: boolean;
}

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

/** Strip a leading short location prefix from an item id so the "same"
 *  item across locations groups under one base slug
 *  (`krk-pizza-margherita` and `waw-pizza-margherita` both → `pizza-margherita`).
 *
 *  Recognises both the seed prefixes hand-rolled in
 *  `src/data/menus/*.ts` (`krk`, `waw`, ...) and the slug-derived
 *  prefixes that `createCustomItem` generates via `slug.slice(0, 3)`
 *  (`kra`, `war`, ...). The earlier implementation only matched the
 *  latter, so seed-item twins were never detected and the admin menu
 *  list duplicated every cross-location product. */
function getBaseSlug(itemId: string): string {
  const m = itemId.match(/^[a-z]{2,4}-(.+)$/);
  return m ? m[1] : itemId;
}

/** A product as it lives across the chain. One row per base slug in the
 *  admin list, with per-location variants exposed via the `locations`
 *  array so the UI can show city/price/margin chips and bulk ops can
 *  fan out to every underlying location-scoped row. */
interface UnifiedItem {
  baseSlug: string;
  /** Stable id used by React keys and as the "primary" argument to
   *  single-item dialogs (edit) — falls back through preferred-location
   *  → first visible → first hidden. */
  primary: MenuItemData;
  primarySlug: string;
  name: string;
  description: string;
  category: MenuCategory;
  tags: string[];
  locations: { slug: string; city: string; item: MenuItemData }[];
  /** True if available at any location. The eye-toggle 86s every variant
   *  when on, un-86s every variant when off — operator intent is "the
   *  product", not "this row's variant". */
  available: boolean;
  /** True only when hidden everywhere it exists; partial-hide is rendered
   *  via per-location chips instead. */
  hidden: boolean;
  hasOverride: boolean;
  hasRecipe: boolean;
}

function unifyMenus(
  byLoc: Record<string, MenuItemData[]>,
  preferredSlug: string,
): UnifiedItem[] {
  const groups = new Map<string, { slug: string; city: string; item: MenuItemData }[]>();
  for (const loc of activeLocations) {
    const arr = byLoc[loc.slug] || [];
    for (const item of arr) {
      const base = getBaseSlug(item.id);
      const bucket = groups.get(base) || [];
      bucket.push({ slug: loc.slug, city: loc.city, item });
      groups.set(base, bucket);
    }
  }
  const unified: UnifiedItem[] = [];
  for (const [baseSlug, locations] of groups) {
    const visible = locations.filter((l) => !l.item._hidden);
    const pick =
      visible.find((l) => l.slug === preferredSlug) ??
      visible[0] ??
      locations.find((l) => l.slug === preferredSlug) ??
      locations[0];
    const primary = pick.item;
    unified.push({
      baseSlug,
      primary,
      primarySlug: pick.slug,
      name: primary.name,
      description: primary.description,
      category: primary.category,
      tags: primary.tags,
      locations,
      available: locations.some((l) => l.item.available && !l.item._hidden),
      hidden: locations.every((l) => l.item._hidden),
      hasOverride: locations.some((l) => l.item._hasOverride),
      hasRecipe: locations.some((l) => l.item._hasRecipe),
    });
  }
  return unified;
}

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

  /** Per-location menu snapshot — single source of truth. The render
   *  derives a unified, deduped view (one row per base slug across all
   *  locations) so the same product doesn't appear twice when it lives
   *  at multiple trucks. Optimistic updates mutate this map directly. */
  const [menusByLocation, setMenusByLocation] = useState<Record<string, MenuItemData[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [editing, setEditing] = useState<MenuItemData | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  /** Unified delete-confirmation state. `scopes` controls which action
   *  buttons the dialog footer renders — bulk toolbar buttons pre-pick
   *  the scope ("current" or "all" alone); the row trash icon offers
   *  both when the item has a cross-location twin, just "current"
   *  otherwise. */
  const [deleteRequest, setDeleteRequest] = useState<{
    items: MenuItemData[];
    scopes: ("current" | "all")[];
    twinLocations: string[];
  } | null>(null);
  /** Bulk-edit dialog state. Open when not null; carries the items being
   *  edited so the dialog can list them, derive twins, and decide which
   *  scope buttons to offer. */
  const [editRequest, setEditRequest] = useState<{
    items: MenuItemData[];
    twinLocations: string[];
  } | null>(null);
  /** Bulk clone-target chooser. The previous per-location "Clone → X"
   *  buttons forced one location at a time; this dialog lets operators
   *  pick multiple targets and fans out one bulk call per target. */
  const [cloneRequest, setCloneRequest] = useState<{
    items: MenuItemData[];
  } | null>(null);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch the current page's menu plus every other active location's
      // menu in parallel. The "by location" snapshot powers the edit
      // dialog's location selector (cross-location twin lookup).
      const responses = await Promise.all(
        activeLocations.map((loc) =>
          fetch(`/api/admin/menu?location=${loc.slug}`).then((r) =>
            r.ok ? r.json() : ([] as MenuItemData[]),
          ),
        ),
      );
      const byLoc: Record<string, MenuItemData[]> = {};
      activeLocations.forEach((loc, idx) => {
        byLoc[loc.slug] = responses[idx];
      });
      setMenusByLocation(byLoc);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Apply a per-row patch to `menusByLocation` for a set of ids. Used
   *  for optimistic updates so the unified render reflects the change
   *  before the network round-trip completes. */
  const patchItemsInPlace = useCallback(
    (ids: Iterable<string>, patch: (i: MenuItemData) => MenuItemData) => {
      const idSet = new Set(ids);
      setMenusByLocation((prev) => {
        const next: Record<string, MenuItemData[]> = {};
        for (const [slug, arr] of Object.entries(prev)) {
          next[slug] = arr.map((i) => (idSet.has(i.id) ? patch(i) : i));
        }
        return next;
      });
    },
    [],
  );

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
        hidden?: boolean | null;
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

  /** Toggle availability across every visible variant of a unified
   *  product — the eye icon represents the product, not a single
   *  truck's row, so 86'ing fans out to all locations. */
  const toggleAvailability = async (unified: UnifiedItem) => {
    const next = !unified.available;
    const targetIds = unified.locations
      .filter((l) => !l.item._hidden)
      .map((l) => l.item.id);
    if (targetIds.length === 0) return;
    patchItemsInPlace(targetIds, (i) => ({ ...i, available: next, _hasOverride: true }));
    const updates: Record<string, { available: boolean }> = {};
    for (const id of targetIds) updates[id] = { available: next };
    const res = await fetch("/api/admin/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: updates }),
    });
    if (!res.ok) {
      toast.error("Could not save", "Reverting availability.");
      patchItemsInPlace(targetIds, (i) => ({ ...i, available: !next }));
    } else {
      const locLabel =
        targetIds.length === 1
          ? unified.locations.find((l) => l.item.id === targetIds[0])?.city
          : `${targetIds.length} locations`;
      toast.success(
        next ? "Item available" : "Item hidden",
        `${unified.name}${locLabel ? ` · ${locLabel}` : ""}`,
      );
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
        patchItemsInPlace(selectedIds, (i) => ({ ...i, available, _hasOverride: true }));
        toast.success(
          available ? "Items marked available" : "Items 86'd",
          `${selectedIds.size} ${selectedIds.size === 1 ? "row" : "rows"} updated.`,
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

  /** Calls POST /api/admin/menu/bulk action="delete". Reused by every
   *  delete entry point (row trash icon + the two bulk toolbar buttons)
   *  so the toast and refetch behaviour stay consistent. */
  const performDelete = useCallback(
    async (ids: string[], scope: "current" | "all", fromBulk: boolean) => {
      if (ids.length === 0) return;
      setBulkBusy(true);
      try {
        const res = await fetch("/api/admin/menu/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids, scope }),
        });
        if (res.ok) {
          const data = await res.json();
          const total = data.affected ?? 0;
          const detail = [
            data.customDeleted ? `${data.customDeleted} removed` : null,
            data.seedHidden ? `${data.seedHidden} hidden` : null,
            data.unresolvedIds?.length ? `${data.unresolvedIds.length} skipped` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const headline = scope === "all" ? "Deleted across locations" : "Deleted";
          if (total > 0) {
            toast.success(
              headline,
              detail || `${total} ${total === 1 ? "item" : "items"} processed.`,
            );
          } else {
            toast.warning("Nothing deleted", detail || "No matching rows found.");
          }
          if (fromBulk) setSelectedIds(new Set());
          await fetchMenu();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error("Could not delete", data?.error);
        }
      } finally {
        setBulkBusy(false);
      }
    },
    [fetchMenu, toast],
  );

  /** Copies the selected items' price/cost/description overrides to the
   *  matching items in EACH chosen target location, matched by name. The
   *  server clone_to endpoint takes a single target, so we fan out per
   *  target and aggregate the matched/unmatched counts before toasting. */
  const bulkCloneToLocations = async (targetSlugs: string[]) => {
    if (selectedIds.size === 0 || targetSlugs.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.all(
        targetSlugs.map(async (slug) => {
          const res = await fetch("/api/admin/menu/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "clone_to", ids, target: slug }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { slug, ok: false as const, error: err?.error || `HTTP ${res.status}` };
          }
          const data = await res.json();
          return {
            slug,
            ok: true as const,
            matched: data.matched ?? 0,
            unmatched: data.unmatched ?? 0,
          };
        }),
      );
      const failures = results.filter((r) => !r.ok);
      const matched = results.reduce((n, r) => (r.ok ? n + r.matched : n), 0);
      const unmatched = results.reduce((n, r) => (r.ok ? n + r.unmatched : n), 0);
      const labels = targetSlugs.map(
        (s) => activeLocations.find((l) => l.slug === s)?.city ?? s,
      );
      if (failures.length === targetSlugs.length) {
        toast.error("Could not clone", failures[0]?.error);
        return;
      }
      const headline =
        targetSlugs.length === 1
          ? `Cloned to ${labels[0]}`
          : `Cloned to ${targetSlugs.length} locations`;
      const detail = [
        matched ? `${matched} matched` : null,
        unmatched ? `${unmatched} skipped` : null,
        failures.length ? `${failures.length} target${failures.length === 1 ? "" : "s"} failed` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (matched > 0) {
        toast.success(headline, detail || labels.join(", "));
      } else {
        toast.warning("Nothing cloned", detail || "No matching names at the targets.");
      }
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  /** Apply a sparse field patch to the selected items (and, when
   *  scope="all", their twins at every other active location). Server
   *  resolves twins by name and routes seed rows through the override
   *  pipeline + custom rows through updateCustomMenuItem in one batch. */
  const performBulkEdit = useCallback(
    async (
      ids: string[],
      patch: Record<string, unknown>,
      scope: "current" | "all",
    ) => {
      if (ids.length === 0 || Object.keys(patch).length === 0) return;
      setBulkBusy(true);
      try {
        const res = await fetch("/api/admin/menu/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", ids, scope, patch }),
        });
        if (res.ok) {
          const data = await res.json();
          const total = data.affected ?? 0;
          const detail = [
            data.seedOverridden ? `${data.seedOverridden} overridden` : null,
            data.customUpdated ? `${data.customUpdated} updated` : null,
            data.unresolvedIds?.length ? `${data.unresolvedIds.length} skipped` : null,
            data.locations?.length ? `${data.locations.length} location${data.locations.length === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const headline = scope === "all" ? "Edited across locations" : "Edited";
          if (total > 0) {
            toast.success(headline, detail || `${total} ${total === 1 ? "item" : "items"} updated.`);
          } else {
            toast.warning("Nothing updated", detail || "No matching rows.");
          }
          setSelectedIds(new Set());
          await fetchMenu();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error("Could not edit", data?.error);
        }
      } finally {
        setBulkBusy(false);
      }
    },
    [fetchMenu, toast],
  );

  /** Look up the cross-location twin for a given base slug. Returns the
   *  matching item from the cached snapshot, plus a hint for which API
   *  endpoint to use when removing it. */
  const findTwin = useCallback(
    (locationSlug: string, baseSlug: string): MenuItemData | null => {
      const arr = menusByLocation[locationSlug] || [];
      return arr.find((i) => !i._hidden && getBaseSlug(i.id) === baseSlug) || null;
    },
    [menusByLocation],
  );

  const saveEdit = async (
    id: string,
    isCustom: boolean,
    submission: EditSubmission,
  ) => {
    const change = submission.fieldChange;
    const issues: string[] = [];

    // 1) Field changes + rename for the current row.
    let effectiveId = id;
    if (Object.keys(change).length > 0 || submission.newId) {
      let ok = false;
      if (isCustom) {
        const customChange = {
          ...(submission.newId ? { newId: submission.newId } : {}),
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
        if (ok && submission.newId) effectiveId = submission.newId;
      } else {
        ok = await persistChange(id, change);
      }
      if (!ok) issues.push("field changes");
    }

    const baseSlug = getBaseSlug(effectiveId);
    const locName = (slug: string) =>
      activeLocations.find((l) => l.slug === slug)?.city ?? slug;

    // 1b) When the operator checked "Apply changes to all locations" in
    // the edit dialog, also push the same field patch to every twin of
    // this item at the OTHER active locations. We route through the
    // bulk endpoint so cross-location twin resolution + custom-vs-seed
    // routing stays in one place (no client-side fan-out).
    if (
      submission.propagateFieldsToAllLocations &&
      Object.keys(change).length > 0
    ) {
      const propagable: Record<string, unknown> = {};
      // The bulk-edit patch schema covers a strict subset of the edit
      // dialog's surface — only fields meaningful as a chain-wide patch.
      // Skip name (renamed per-row) + sku/modifiers (per-row identity).
      if (change.price !== undefined) propagable.price = change.price;
      if (change.cost !== undefined) propagable.cost = change.cost;
      if (change.description !== undefined) propagable.description = change.description;
      if (change.category !== undefined) propagable.category = change.category;
      if (change.tags !== undefined) propagable.tags = change.tags;
      if (change.available !== undefined) propagable.available = change.available;
      if (change.deliveryOnly !== undefined) propagable.deliveryOnly = change.deliveryOnly;
      if (change.packagingCost !== undefined) propagable.packagingCost = change.packagingCost;
      if (Object.keys(propagable).length > 0) {
        const res = await fetch("/api/admin/menu/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit",
            ids: [effectiveId],
            scope: "all",
            patch: propagable,
          }),
        });
        if (!res.ok) issues.push("propagate to other locations");
      }
    }

    // 2) Clone the post-edit item to newly-checked locations + 3)
    // remove from newly-unchecked locations. Fanned out in parallel —
    // the custom-items store serialises writes via withLock so
    // concurrent calls don't corrupt the file.
    const cloneResults = await Promise.all(
      submission.addTo.map(async (slug) => {
        const prefix = slug.slice(0, 3) || "loc";
        const cloneId = `${prefix}-${baseSlug}`;
        const body = {
          id: cloneId,
          locationSlug: slug,
          name: submission.draft.name,
          description: submission.draft.description,
          price: submission.draft.price,
          cost: submission.draft.cost,
          category: submission.draft.category,
          tags: submission.draft.tags,
          available: submission.draft.available,
          ...(submission.draft.sku ? { sku: submission.draft.sku } : {}),
          ...(submission.draft.deliveryOnly ? { deliveryOnly: true } : {}),
          ...(submission.draft.packagingCost !== undefined
            ? { packagingCost: submission.draft.packagingCost }
            : {}),
          ...(submission.draft.modifierGroups
            ? { modifierGroups: submission.draft.modifierGroups }
            : {}),
        };
        const res = await fetch("/api/admin/menu/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { slug, ok: res.ok, op: "clone" as const };
      }),
    );
    for (const r of cloneResults) {
      if (!r.ok) issues.push(`clone to ${locName(r.slug)}`);
    }

    // Custom twins: hard-delete via /api/admin/menu/custom?id=…
    // Seed twins: set the `hidden: true` override (restorable).
    // pageLoc is treated the same — unchecking it removes the row here.
    const removeResults = await Promise.all(
      submission.removeFrom.map(async (slug) => {
        const twin = findTwin(slug, baseSlug);
        if (!twin) return { slug, ok: true, op: "noop" as const };
        if (twin._isCustom) {
          const ok = await hardDeleteCustomItem(twin.id);
          return { slug, ok, op: "delete" as const };
        }
        const res = await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: { [twin.id]: { hidden: true } } }),
        });
        return { slug, ok: res.ok, op: "hide" as const };
      }),
    );
    for (const r of removeResults) {
      if (!r.ok) {
        issues.push(`${r.op === "hide" ? "hide" : "delete"} at ${locName(r.slug)}`);
      }
    }

    if (issues.length > 0) {
      toast.error("Some changes failed", issues.join(", "));
    } else {
      toast.success("Menu item updated");
    }
    setEditing(null);
    // Refresh from server — the orchestration above touched multiple
    // locations and renames, so optimistic local merging would drift.
    await fetchMenu();
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
    // generate `${locPrefix}-${baseSlug}` per location and fan the
    // requests out in parallel — the server serialises writes via
    // withLock("custom-menu-items.json") so concurrent POSTs are safe.
    const targets = draft.locationSlugs.length > 0 ? draft.locationSlugs : [pageLoc];
    const results = await Promise.all(
      targets.map(async (slug) => {
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
        if (res.ok) return { slug, ok: true as const };
        const err = await res.json().catch(() => ({}));
        return {
          slug,
          ok: false as const,
          error: err?.error || `HTTP ${res.status}`,
        };
      }),
    );
    const failures = results.flatMap((r) =>
      r.ok ? [] : [{ slug: r.slug, error: r.error }],
    );

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

  /** Hard-delete an admin-created row at any location. Used by the row
   *  trash icon (custom items) and the edit dialog's location selector
   *  when a location is unchecked. Returns true on success so the caller
   *  can update local state. */
  const hardDeleteCustomItem = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await fetch(`/api/admin/menu/custom?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not delete", err?.error || "Try again.");
        return false;
      }
      return true;
    },
    [toast],
  );

  /** Locate the location that owns a given item id by looking it up in
   *  the per-location snapshot. The list is unified across trucks, so
   *  `selectedIds` can mix Kraków / Warszawa rows — we can't assume
   *  `pageLoc` owns every selected id like the per-location list could. */
  const locationOfItem = useCallback(
    (itemId: string): string => {
      for (const [slug, arr] of Object.entries(menusByLocation)) {
        if (arr.some((i) => i.id === itemId)) return slug;
      }
      return pageLoc;
    },
    [menusByLocation, pageLoc],
  );

  /** Return the active-location slugs (other than the item's own) that
   *  carry the same product — matched by base slug OR case-insensitive
   *  name. Drives the "Delete everywhere" affordance: we only offer it
   *  when the row actually has twins to clean up. */
  const findTwinLocations = useCallback(
    (item: MenuItemData): string[] => {
      const baseSlug = getBaseSlug(item.id);
      const nameKey = item.name.trim().toLowerCase();
      const ownLoc = locationOfItem(item.id);
      const hits: string[] = [];
      for (const loc of activeLocations) {
        if (loc.slug === ownLoc) continue;
        const arr = menusByLocation[loc.slug] || [];
        const twin = arr.find(
          (i) =>
            !i._hidden &&
            (getBaseSlug(i.id) === baseSlug || i.name.trim().toLowerCase() === nameKey),
        );
        if (twin) hits.push(loc.slug);
      }
      return hits;
    },
    [menusByLocation, locationOfItem],
  );

  const deleteItem = (item: MenuItemData) => {
    const twins = findTwinLocations(item);
    setDeleteRequest({
      items: [item],
      scopes: twins.length > 0 ? ["current", "all"] : ["current"],
      twinLocations: twins,
    });
  };

  /** Flat union of every variant across all locations — used by the
   *  bulk dialogs to resolve `selectedIds` (which may span multiple
   *  trucks now that the list is unified) without limiting to the
   *  current page's snapshot. */
  const allItems = useMemo(
    () => Object.values(menusByLocation).flat(),
    [menusByLocation],
  );

  const openBulkDelete = (scope: "current" | "all") => {
    if (selectedIds.size === 0) return;
    const selected = allItems.filter((i) => selectedIds.has(i.id));
    setDeleteRequest({
      items: selected,
      scopes: [scope],
      twinLocations: [],
    });
  };

  /** Compute the union of twin locations across a set of items — drives
   *  whether the bulk-edit dialog should offer the "Apply everywhere"
   *  scope and how the description summarizes reach. */
  const aggregateTwinLocations = useCallback(
    (subset: MenuItemData[]): string[] => {
      const set = new Set<string>();
      for (const it of subset) {
        for (const slug of findTwinLocations(it)) set.add(slug);
      }
      return [...set];
    },
    [findTwinLocations],
  );

  const openBulkEdit = () => {
    if (selectedIds.size === 0) return;
    const selected = allItems.filter((i) => selectedIds.has(i.id));
    setEditRequest({
      items: selected,
      twinLocations: aggregateTwinLocations(selected),
    });
  };

  const openBulkClone = () => {
    if (selectedIds.size === 0) return;
    const selected = allItems.filter((i) => selectedIds.has(i.id));
    setCloneRequest({ items: selected });
  };

  const confirmDelete = async (scope: "current" | "all") => {
    if (!deleteRequest) return;
    const ids = deleteRequest.items.map((i) => i.id);
    const fromBulk = deleteRequest.items.length > 1 || selectedIds.size > 1;
    setDeleteRequest(null);
    await performDelete(ids, scope, fromBulk);
  };

  /** Clear the `hidden` override flag so a previously soft-deleted seed
   *  item is restored — fans out across every hidden variant of the
   *  unified product so the row un-hides everywhere it was soft-deleted. */
  const restoreUnified = async (unified: UnifiedItem) => {
    const hiddenIds = unified.locations.filter((l) => l.item._hidden).map((l) => l.item.id);
    if (hiddenIds.length === 0) return;
    const updates: Record<string, { hidden: null }> = {};
    for (const id of hiddenIds) updates[id] = { hidden: null };
    const res = await fetch("/api/admin/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: updates }),
    });
    if (!res.ok) {
      toast.error("Could not restore", "Try again.");
      return;
    }
    patchItemsInPlace(hiddenIds, (i) => ({ ...i, _hidden: false }));
    toast.success("Item restored", unified.name);
  };

  // --- Derived ---
  const unifiedItems = useMemo(
    () => unifyMenus(menusByLocation, pageLoc),
    [menusByLocation, pageLoc],
  );

  const categories = useMemo(
    () => CATEGORY_ORDER.filter((c) => unifiedItems.some((u) => u.category === c)),
    [unifiedItems],
  );

  const hiddenCount = useMemo(
    () => unifiedItems.filter((u) => u.hidden).length,
    [unifiedItems],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unifiedItems.filter((u) => {
      if (u.hidden && !showHidden) return false;
      if (category !== "all" && u.category !== category) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.description.toLowerCase().includes(q) ||
        u.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [unifiedItems, search, category, showHidden]);

  const grouped = useMemo(() => {
    const m = new Map<MenuCategory, UnifiedItem[]>();
    for (const u of filtered) {
      const arr = m.get(u.category) || [];
      arr.push(u);
      m.set(u.category, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const unavailableCount = unifiedItems.filter((u) => !u.available).length;

  const locOptions = activeLocations.map((l) => ({ value: l.slug, label: l.city }));

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Menu</h1>
          <p className="v2-page-subtitle">
            {unifiedItems.length} {unifiedItems.length === 1 ? "product" : "products"} across {activeLocations.length} location{activeLocations.length === 1 ? "" : "s"}
            {unavailableCount > 0 && ` · ${unavailableCount} hidden from customers`}
          </p>
        </div>
        <div className="v2-page-actions">
          <div className="v2-field-inline" title="Default location for new items and the lens used to pick a row's primary variant.">
            <MapPin className="h-3.5 w-3.5 v2-muted" />
            <Select
              value={pageLoc}
              onChange={(e) => setPageLoc(e.target.value)}
              options={locOptions}
              aria-label="Default location for new items"
            />
          </div>
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? "Hide soft-deleted items" : "Reveal soft-deleted items so you can restore them"}
            >
              {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
            </Button>
          )}
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
            { value: "all", label: "All", count: unifiedItems.length },
            ...categories.map((c) => ({
              value: c,
              label: MENU_CATEGORY_LABELS[c],
              count: unifiedItems.filter((u) => u.category === c).length,
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
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy}
              onClick={openBulkEdit}
              title="Apply price / cost / availability / category / tags / description / packaging across the selected items, optionally fan-out to all locations."
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit selected
            </Button>
            {activeLocations.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={openBulkClone}
                title="Clone the selected items' price / cost / description overrides to multiple target locations at once."
              >
                Clone to…
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy}
              onClick={bulkResetOverrides}
              title="Drop any custom price / cost / description / availability for the selected items — reverts to seed values."
            >
              Reset overrides
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy}
              onClick={() => openBulkDelete("current")}
              title="Remove the selected items from this location. Custom items hard-delete; seed items soft-hide (restorable via Show hidden)."
              style={{ color: "var(--danger)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete here
            </Button>
            {activeLocations.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => openBulkDelete("all")}
                title="Remove the selected items from every active location. Twins are matched by name across trucks."
                style={{ color: "var(--danger)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete everywhere
              </Button>
            )}
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
              title={unifiedItems.length === 0 ? "No menu items" : "No matches"}
              description={
                unifiedItems.length === 0
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
            const allSingleLocation = list.every((u) => u.locations.length <= 1);
            return (
              <section key={cat} className="v2-mng-section" data-variant="menu">
                <header className="v2-mng-section-header">
                  <span className="v2-mng-section-eyebrow">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="v2-mng-section-name">{MENU_CATEGORY_LABELS[cat]}</span>
                    <span className="v2-mng-section-count">{list.length}</span>
                  </span>
                  {allSingleLocation ? (
                    <>
                      <span className="v2-mng-col">Price</span>
                      <span className="v2-mng-col">Cost</span>
                      <span className="v2-mng-col">Margin</span>
                      <span aria-hidden />
                    </>
                  ) : (
                    <>
                      <span className="v2-mng-col" style={{ gridColumn: "span 3", textAlign: "left" }}>
                        Per-location price · cost · margin
                      </span>
                      <span aria-hidden />
                    </>
                  )}
                </header>
                <ul className="v2-mng-list">
                  {list.map((unified) => {
                    const primary = unified.primary;
                    const primaryMargin = marginPct(primary.price, primary.cost);
                    const isMulti = unified.locations.length > 1;
                    // Row is "selected" when every variant's id is in
                    // selectedIds; toggling cascades to all variants so
                    // the bulk dialogs see every underlying row.
                    const allIds = unified.locations.map((l) => l.item.id);
                    const allSelected =
                      allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
                    return (
                      <li
                        key={unified.baseSlug}
                        className={`v2-mng-row v2-mng-row-menu ${unified.available ? "" : "is-off"}`}
                        style={
                          unified.hidden
                            ? { background: "var(--surface-2)", opacity: 0.65 }
                            : allSelected
                            ? { background: "var(--brand-soft)" }
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          className="v2-mng-select"
                          checked={allSelected}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (allIds.every((id) => next.has(id))) {
                                for (const id of allIds) next.delete(id);
                              } else {
                                for (const id of allIds) next.add(id);
                              }
                              return next;
                            });
                          }}
                          aria-label={allSelected ? `Deselect ${unified.name}` : `Select ${unified.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleAvailability(unified)}
                          className={`v2-mng-toggle ${unified.available ? "is-on" : "is-off"}`}
                          aria-label={unified.available ? "Mark sold out" : "Mark available"}
                          title={
                            isMulti
                              ? unified.available
                                ? `Mark sold out at all ${unified.locations.length} locations`
                                : `Mark available at all ${unified.locations.length} locations`
                              : unified.available
                              ? "Mark sold out"
                              : "Mark available"
                          }
                        >
                          {unified.available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>

                        <div className="v2-mng-row-main">
                          <div className="v2-mng-row-headline">
                            <span className="v2-mng-row-name">{unified.name}</span>
                            {unified.hidden && (
                              <span className="v2-mng-tag v2-mng-tag-override" title="Soft-deleted at every location it occupies. Restore from the row.">Hidden</span>
                            )}
                            {unified.hasOverride && !unified.hidden && (
                              <span className="v2-mng-tag v2-mng-tag-override" title="At least one location has a manual override on this product.">Edited</span>
                            )}
                            {primary.sku && (
                              <span className="v2-mng-tag" title="SKU / inventory code">
                                {primary.sku}
                              </span>
                            )}
                            {unified.tags.map((t) => (
                              <span key={t} className="v2-mng-tag">{t}</span>
                            ))}
                          </div>
                          {unified.description && <p className="v2-mng-row-desc">{unified.description}</p>}
                          {isMulti && (
                            <div className="v2-mng-loc-chips" role="list" aria-label="Per-location variants">
                              {unified.locations.map((l) => {
                                const lm = marginPct(l.item.price, l.item.cost);
                                return (
                                  <span
                                    key={l.slug}
                                    role="listitem"
                                    className="v2-mng-loc-chip"
                                    data-hidden={l.item._hidden ? "true" : undefined}
                                    data-off={!l.item.available ? "true" : undefined}
                                    title={[
                                      `${l.city} · ${formatPrice(l.item.price)} · ${lm}% margin`,
                                      l.item._hasOverride ? "edited" : null,
                                      l.item._hidden ? "hidden" : null,
                                      !l.item.available ? "86'd" : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  >
                                    <MapPin className="h-3 w-3" aria-hidden />
                                    <span className="v2-mng-loc-city">{l.city}</span>
                                    <span className="v2-mng-loc-price tabular">{formatPrice(l.item.price)}</span>
                                    <span className="v2-mng-loc-cost tabular">{formatPrice(l.item.cost)}</span>
                                    <span className={`v2-mng-loc-margin v2-mng-val-margin-${marginTone(lm)} tabular`}>{lm}%</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {isMulti ? (
                          <span style={{ gridColumn: "span 3" }} aria-hidden />
                        ) : (
                          <>
                            <span className="v2-mng-val v2-mng-val-price tabular">{formatPrice(primary.price)}</span>
                            <span
                              className="v2-mng-val v2-mng-val-cost tabular"
                              title={primary._hasRecipe ? "Cost is computed from this item's recipe (canonical)." : primary._costSource === "override" ? "Cost is a manual override." : "Cost is the seed value — no recipe yet."}
                            >
                              {formatPrice(primary.cost)}
                              {primary._hasRecipe && <span className="v2-mng-cost-source"> recipe</span>}
                            </span>
                            <span className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${marginTone(primaryMargin)} tabular`}>{primaryMargin}%</span>
                          </>
                        )}

                        <span className="v2-mng-edit-group">
                          {unified.hidden ? (
                            <button
                              type="button"
                              className="v2-mng-edit"
                              onClick={() => restoreUnified(unified)}
                              aria-label={`Restore ${unified.name}`}
                              title="Restore product — un-hide at every location"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="v2-mng-edit"
                              onClick={() => setEditing(primary)}
                              aria-label={`Edit ${unified.name}`}
                              title={
                                isMulti
                                  ? `Edit ${unified.name} — opens the ${unified.locations.find((l) => l.slug === unified.primarySlug)?.city ?? activeLocations[0]?.city ?? ""} variant. Tick "Apply changes to all locations" to fan out.`
                                  : "Edit item"
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!unified.hidden && (
                            <button
                              type="button"
                              className="v2-mng-edit v2-mng-edit-danger"
                              onClick={() => deleteItem(primary)}
                              aria-label={`Delete ${unified.name}`}
                              title={
                                isMulti
                                  ? `Delete ${unified.name} — defaults to deleting at ${unified.locations.find((l) => l.slug === unified.primarySlug)?.city ?? ""}; pick "Delete everywhere" in the dialog to remove from all locations.`
                                  : primary._isCustom
                                  ? "Delete item (permanent)"
                                  : "Hide seed item (restoreable)"
                              }
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
        currentSlug={editing ? locationOfItem(editing.id) : pageLoc}
        menusByLocation={menusByLocation}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />

      <CreateItemDialog
        open={creating}
        locationSlug={pageLoc}
        onClose={() => setCreating(false)}
        onCreate={createCustomItem}
      />

      <DeleteMenuItemDialog
        request={deleteRequest}
        currentLocationLabel={
          activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc
        }
        twinLocationLabels={
          deleteRequest?.twinLocations.map(
            (slug) => activeLocations.find((l) => l.slug === slug)?.city ?? slug,
          ) ?? []
        }
        busy={bulkBusy}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />

      <BulkEditDialog
        request={editRequest}
        currentLocationLabel={
          activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc
        }
        twinLocationLabels={
          editRequest?.twinLocations.map(
            (slug) => activeLocations.find((l) => l.slug === slug)?.city ?? slug,
          ) ?? []
        }
        busy={bulkBusy}
        onCancel={() => setEditRequest(null)}
        onConfirm={async (patch, scope) => {
          const ids = editRequest?.items.map((i) => i.id) ?? [];
          setEditRequest(null);
          await performBulkEdit(ids, patch, scope);
        }}
      />

      <BulkCloneDialog
        request={cloneRequest}
        currentLocationSlug={pageLoc}
        busy={bulkBusy}
        onCancel={() => setCloneRequest(null)}
        onConfirm={async (targets) => {
          setCloneRequest(null);
          await bulkCloneToLocations(targets);
        }}
      />
    </div>
  );
}

interface DeleteMenuItemDialogProps {
  request: {
    items: MenuItemData[];
    scopes: ("current" | "all")[];
    twinLocations: string[];
  } | null;
  currentLocationLabel: string;
  twinLocationLabels: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (scope: "current" | "all") => void;
}

/** Single confirmation dialog reused by the row trash icon + both bulk
 *  toolbar buttons. The footer renders one danger button per allowed
 *  scope (just "Delete here" when the user already picked a scope from
 *  the toolbar, both buttons when a row has cross-location twins). */
function DeleteMenuItemDialog({
  request,
  currentLocationLabel,
  twinLocationLabels,
  busy,
  onCancel,
  onConfirm,
}: DeleteMenuItemDialogProps) {
  const open = request !== null;
  const items = request?.items ?? [];
  const scopes = request?.scopes ?? [];
  const count = items.length;
  const customCount = items.filter((i) => i._isCustom).length;
  const seedCount = count - customCount;
  const singleName = count === 1 ? items[0].name : null;

  const title = singleName
    ? `Delete "${singleName}"?`
    : `Delete ${count} menu items?`;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onCancel}
      size="md"
      title={title}
      description={
        twinLocationLabels.length > 0
          ? `Also exists at: ${twinLocationLabels.join(", ")}.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          {scopes.includes("current") && (
            <Button
              variant="danger"
              onClick={() => onConfirm("current")}
              loading={busy && scopes.length === 1}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete from {currentLocationLabel}
            </Button>
          )}
          {scopes.includes("all") && (
            <Button
              variant="danger"
              onClick={() => onConfirm("all")}
              loading={busy && scopes.length === 1}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete everywhere
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {count > 1 && (
          <ul
            style={{
              listStyle: "disc",
              paddingLeft: "1.25rem",
              margin: 0,
              maxHeight: "10rem",
              overflowY: "auto",
              fontSize: "0.875rem",
            }}
          >
            {items.slice(0, 12).map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
            {items.length > 12 && (
              <li style={{ listStyle: "none", opacity: 0.7 }}>
                …and {items.length - 12} more
              </li>
            )}
          </ul>
        )}
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {customCount > 0 && (
            <div>
              <strong>{customCount}</strong>{" "}
              {customCount === 1 ? "custom item" : "custom items"} will be{" "}
              <strong>permanently removed</strong>.
            </div>
          )}
          {seedCount > 0 && (
            <div>
              <strong>{seedCount}</strong>{" "}
              {seedCount === 1 ? "seed item" : "seed items"} will be{" "}
              <strong>hidden</strong> (restorable via &ldquo;Show hidden&rdquo;).
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ─── Bulk edit dialog ─────────────────────────────────────────────────────
//
// Apply a sparse field patch to the selected rows in one go. Each field
// has an "enable" checkbox so operators only push the values they
// actually want to change — leaving everything else untouched. The
// footer offers "Apply here" vs "Apply everywhere" so the same patch
// can fan out to twins at every active location, matched by name.

interface BulkEditDialogProps {
  request: {
    items: MenuItemData[];
    twinLocations: string[];
  } | null;
  currentLocationLabel: string;
  twinLocationLabels: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (
    patch: Record<string, unknown>,
    scope: "current" | "all",
  ) => void | Promise<void>;
}

function BulkEditDialog({
  request,
  currentLocationLabel,
  twinLocationLabels,
  busy,
  onCancel,
  onConfirm,
}: BulkEditDialogProps) {
  const open = request !== null;
  const items = request?.items ?? [];

  // Track which fields the operator wants to push + the value for each.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [priceStr, setPriceStr] = useState("");
  const [costStr, setCostStr] = useState("");
  const [available, setAvailable] = useState(true);
  const [category, setCategory] = useState<MenuCategory>("pizza");
  const [tagSet, setTagSet] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [packagingStr, setPackagingStr] = useState("");

  // Reset form whenever a new request opens so stale values from the
  // previous open don't leak in.
  useEffect(() => {
    if (open) {
      setEnabled({});
      setPriceStr("");
      setCostStr("");
      setAvailable(true);
      setCategory("pizza");
      setTagSet([]);
      setDescription("");
      setDeliveryOnly(false);
      setPackagingStr("");
    }
  }, [open]);

  if (!open) return <Dialog open={false} onClose={onCancel} />;

  const toggleField = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleTag = (tag: string) =>
    setTagSet((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (enabled.price) {
      const v = Math.round(parseFloat(priceStr || "0") * 100);
      if (v >= 0) patch.price = v;
    }
    if (enabled.cost) {
      const v = Math.round(parseFloat(costStr || "0") * 100);
      if (v >= 0) patch.cost = v;
    }
    if (enabled.available) patch.available = available;
    if (enabled.category) patch.category = category;
    if (enabled.tags) patch.tags = tagSet;
    if (enabled.description) patch.description = description;
    if (enabled.deliveryOnly) patch.deliveryOnly = deliveryOnly ? true : null;
    if (enabled.packagingCost) {
      const raw = packagingStr.trim();
      patch.packagingCost =
        raw === "" ? null : Math.max(0, Math.round(parseFloat(raw || "0") * 100));
    }
    return patch;
  };

  const patch = buildPatch();
  const patchKeys = Object.keys(patch);
  const canSubmit = patchKeys.length > 0 && !busy;
  const offerAllScope = twinLocationLabels.length > 0;

  const fieldRow = (
    key: string,
    label: string,
    input: ReactNode,
    hint?: string,
  ) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0.5rem 0.75rem",
        alignItems: "start",
        padding: "0.625rem 0.75rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: enabled[key] ? "var(--brand-soft, var(--surface-2))" : "var(--surface-1)",
      }}
    >
      <input
        type="checkbox"
        id={`bulk-edit-${key}`}
        checked={!!enabled[key]}
        onChange={() => toggleField(key)}
        style={{ width: 16, height: 16, marginTop: 2 }}
      />
      <label
        htmlFor={`bulk-edit-${key}`}
        style={{ fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
      >
        {label}
      </label>
      <span style={{ gridColumn: "2 / 3" }}>
        <div style={{ opacity: enabled[key] ? 1 : 0.45 }}>{input}</div>
        {hint && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--fg-muted)",
              marginTop: 4,
            }}
          >
            {hint}
          </div>
        )}
      </span>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onCancel}
      size="lg"
      title={
        items.length === 1
          ? `Edit "${items[0].name}"`
          : `Edit ${items.length} menu items`
      }
      description={
        offerAllScope
          ? `Also exists at: ${twinLocationLabels.join(", ")}. Pick which fields to change, then choose scope.`
          : "Pick which fields to change. Empty fields stay untouched."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(patch, "current")}
            disabled={!canSubmit}
            loading={busy && !offerAllScope}
          >
            Apply to {currentLocationLabel}
          </Button>
          {offerAllScope && (
            <Button
              variant="primary"
              onClick={() => onConfirm(patch, "all")}
              disabled={!canSubmit}
              loading={busy}
            >
              Apply everywhere
            </Button>
          )}
        </>
      }
    >
      <div className="v2-stack-12">
        {items.length > 1 && (
          <details
            style={{
              fontSize: "0.8125rem",
              color: "var(--fg-muted)",
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-2)",
            }}
          >
            <summary style={{ cursor: "pointer" }}>
              {items.length} items selected
            </summary>
            <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
              {items.slice(0, 20).map((i) => (
                <li key={i.id}>{i.name}</li>
              ))}
              {items.length > 20 && (
                <li style={{ listStyle: "none", opacity: 0.7 }}>
                  …and {items.length - 20} more
                </li>
              )}
            </ul>
          </details>
        )}

        {fieldRow(
          "price",
          "Price (PLN)",
          <Input
            type="number"
            step="0.01"
            min="0"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            disabled={!enabled.price}
            trailingAdornment={<span className="v2-muted">zł</span>}
            placeholder="e.g. 27.90"
          />,
        )}

        {fieldRow(
          "cost",
          "Food cost (PLN)",
          <Input
            type="number"
            step="0.01"
            min="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            disabled={!enabled.cost}
            trailingAdornment={<span className="v2-muted">zł</span>}
            placeholder="e.g. 4.50"
          />,
          "Recipe-attached items keep their canonical cost; the override is stored but ignored.",
        )}

        {fieldRow(
          "available",
          "Available to customers",
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
            }}
          >
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              disabled={!enabled.available}
            />
            {available ? "Available" : "Sold out / hidden"}
          </label>,
        )}

        {fieldRow(
          "category",
          "Category",
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as MenuCategory)}
            disabled={!enabled.category}
            options={CATEGORY_ORDER.map((c) => ({
              value: c,
              label: MENU_CATEGORY_LABELS[c],
            }))}
          />,
        )}

        {fieldRow(
          "tags",
          "Tags (replace)",
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {MENU_TAGS.map((tag) => {
              const on = tagSet.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  className={`v2-chip ${on ? "is-on" : ""}`}
                  disabled={!enabled.tags}
                  style={enabled.tags ? undefined : { cursor: "default" }}
                >
                  {tag}
                </button>
              );
            })}
          </div>,
          "Replaces the tag list — uncheck all to clear.",
        )}

        {fieldRow(
          "description",
          "Description",
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!enabled.description}
            rows={3}
            placeholder="New description for the selected items…"
          />,
        )}

        {fieldRow(
          "deliveryOnly",
          "Delivery-only",
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
            }}
          >
            <input
              type="checkbox"
              checked={deliveryOnly}
              onChange={(e) => setDeliveryOnly(e.target.checked)}
              disabled={!enabled.deliveryOnly}
            />
            {deliveryOnly ? "Delivery only" : "Available on every channel"}
          </label>,
        )}

        {fieldRow(
          "packagingCost",
          "Packaging cost (PLN)",
          <Input
            type="number"
            step="0.01"
            min="0"
            value={packagingStr}
            onChange={(e) => setPackagingStr(e.target.value)}
            disabled={!enabled.packagingCost}
            trailingAdornment={<span className="v2-muted">zł</span>}
            placeholder="Blank = category default"
          />,
          "Per-unit box/wrap cost on delivery orders. Blank clears the override.",
        )}
      </div>
    </Dialog>
  );
}

// ─── Bulk clone dialog (multi-target) ────────────────────────────────────
//
// Replaces the per-location "Clone → X" buttons in the bulk toolbar.
// Operators pick any combination of target locations and the parent
// fans out one bulk clone_to call per target, aggregating the
// matched / unmatched counts before toasting.

interface BulkCloneDialogProps {
  request: { items: MenuItemData[] } | null;
  currentLocationSlug: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (targets: string[]) => void | Promise<void>;
}

function BulkCloneDialog({
  request,
  currentLocationSlug,
  busy,
  onCancel,
  onConfirm,
}: BulkCloneDialogProps) {
  const open = request !== null;
  const items = request?.items ?? [];
  const candidates = activeLocations.filter((l) => l.slug !== currentLocationSlug);
  const [targets, setTargets] = useState<string[]>([]);

  useEffect(() => {
    if (open) setTargets([]);
  }, [open]);

  if (!open) return <Dialog open={false} onClose={onCancel} />;

  const toggle = (slug: string) =>
    setTargets((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onCancel}
      size="md"
      title={
        items.length === 1
          ? `Clone "${items[0].name}" overrides`
          : `Clone ${items.length} items' overrides`
      }
      description="Copies the price / cost / description / role / LTO overrides to the matching items in each selected location. Availability stays a local decision."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => setTargets(candidates.map((l) => l.slug))}
            disabled={busy || candidates.length === 0}
          >
            Select all
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(targets)}
            disabled={targets.length === 0 || busy}
            loading={busy}
          >
            Clone to{" "}
            {targets.length === 0
              ? "…"
              : targets.length === 1
              ? activeLocations.find((l) => l.slug === targets[0])?.city ?? targets[0]
              : `${targets.length} locations`}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {candidates.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--fg-muted)", margin: 0 }}>
            No other active locations to clone to.
          </p>
        ) : (
          candidates.map((loc) => {
            const on = targets.includes(loc.slug);
            return (
              <label
                key={loc.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: "0.625rem 0.75rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: on ? "var(--brand-soft, var(--surface-2))" : "var(--surface-1)",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(loc.slug)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{loc.city}</span>
                <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                  {loc.slug}
                </span>
              </label>
            );
          })
        )}
      </div>
    </Dialog>
  );
}

interface EditSubmission {
  fieldChange: {
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
  };
  /** Custom-item rename. Ignored for seed items. */
  newId?: string;
  /** Location slugs to clone the (post-edit) item to. */
  addTo: string[];
  /** Location slugs to remove the item from — for each, the parent
   *  looks up the twin by base slug and either hard-deletes (custom)
   *  or sets `hidden: true` (seed). */
  removeFrom: string[];
  /** When true, the field changes also propagate to every twin of this
   *  item at other active locations (matched by name). Saves the
   *  operator from re-opening this dialog for each truck. */
  propagateFieldsToAllLocations?: boolean;
  /** Full snapshot of the edited values, used for cloning. */
  draft: {
    name: string;
    description: string;
    price: number;
    cost: number;
    category: MenuCategory;
    tags: string[];
    available: boolean;
    sku?: string;
    deliveryOnly?: boolean;
    packagingCost?: number;
    modifierGroups?: ModifierGroup[];
  };
}

interface EditDialogProps {
  item: MenuItemData | null;
  currentSlug: string;
  menusByLocation: Record<string, MenuItemData[]>;
  onClose: () => void;
  onSave: (
    id: string,
    isCustom: boolean,
    submission: EditSubmission,
  ) => Promise<void> | void;
}

function EditItemDialog({ item, currentSlug, menusByLocation, onClose, onSave }: EditDialogProps) {
  const [name, setName] = useState("");
  const [idStr, setIdStr] = useState("");
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

  // Locations where this product currently lives — derived from the
  // cross-location menu snapshot by base-slug match. Operators
  // check/uncheck to clone the item to a new truck or remove it from
  // an existing one (delete for custom rows, hide for seed rows).
  const initialLocations = useMemo(() => {
    if (!item) return [currentSlug];
    const baseSlug = getBaseSlug(item.id);
    return activeLocations
      .filter((loc) => {
        const locItems = menusByLocation[loc.slug] || [];
        return locItems.some(
          (i) => !i._hidden && getBaseSlug(i.id) === baseSlug,
        );
      })
      .map((l) => l.slug);
  }, [item, currentSlug, menusByLocation]);

  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  /** "Apply price/cost/description changes to every other location where
   *  this item exists." Only meaningful when the item has at least one
   *  cross-location twin — the dialog renders the checkbox conditionally. */
  const [propagateAll, setPropagateAll] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setIdStr(item.id);
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
      setSelectedLocations(initialLocations);
      setPropagateAll(false);
      setBusy(false);
    }
  }, [item, initialLocations]);

  if (!item) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const isCustom = Boolean(item._isCustom);
  // Recipe-attached items get their cost computed from ingredients, so the
  // field is locked regardless of whether the row is seed or custom.
  const canEditCost = !item._hasRecipe;
  // Seed item IDs live in code (src/data/menus/*.ts) — we can't rename
  // them at runtime. Custom rows are renameable via the PATCH endpoint.
  const canEditId = isCustom;

  const submit = async () => {
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const change: EditSubmission["fieldChange"] = {};
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

    const trimmedId = idStr.trim();
    let newId: string | undefined;
    if (canEditId && trimmedId !== item.id) {
      if (!/^[a-z0-9-]{3,60}$/.test(trimmedId)) {
        alert("Item slug must be 3–60 chars, lowercase letters, digits, and hyphens only.");
        return;
      }
      newId = trimmedId;
    }

    const addTo = selectedLocations.filter((s) => !initialLocations.includes(s));
    const removeFrom = initialLocations.filter((s) => !selectedLocations.includes(s));

    const nothingChanged =
      Object.keys(change).length === 0 &&
      !newId &&
      addTo.length === 0 &&
      removeFrom.length === 0;
    if (nothingChanged) {
      onClose();
      return;
    }
    setBusy(true);
    await onSave(item.id, isCustom, {
      fieldChange: change,
      newId,
      addTo,
      removeFrom,
      propagateFieldsToAllLocations: propagateAll,
      draft: {
        name: trimmedName || item.name,
        description: desc,
        price,
        cost: Math.round(parseFloat(costStr || "0") * 100),
        category: cat,
        tags,
        available,
        ...(trimmedSku ? { sku: trimmedSku } : {}),
        ...(deliveryOnly ? { deliveryOnly: true } : {}),
        ...(nextPackaging !== null ? { packagingCost: nextPackaging } : {}),
        ...(cleanedGroups.length > 0 ? { modifierGroups: cleanedGroups } : {}),
      },
    });
    setBusy(false);
  };

  const toggleLocation = (slug: string) => {
    setSelectedLocations((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
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
      description={
        initialLocations.filter((s) => s !== currentSlug).length > 0
          ? `Changes apply to ${activeLocations.find((l) => l.slug === currentSlug)?.city ?? currentSlug} unless you tick "Apply to all locations" below.`
          : "Changes apply to this location only. Save to publish."
      }
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
          label="Item slug"
          value={idStr}
          onChange={(e) =>
            setIdStr(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
          }
          disabled={!canEditId}
          description={
            canEditId
              ? "Stable identifier used in orders + analytics. Renaming preserves the row; historical orders keep the old slug."
              : "Seed item slugs live in src/data/menus/*.ts and can't be renamed from the admin."
          }
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
        <div className="v2-field">
          <label className="v2-field-label">Available at locations</label>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {activeLocations.map((loc) => {
              const on = selectedLocations.includes(loc.slug);
              const wasInitial = initialLocations.includes(loc.slug);
              const willClone = on && !wasInitial;
              const willRemove = !on && wasInitial;
              return (
                <button
                  key={loc.slug}
                  type="button"
                  onClick={() => toggleLocation(loc.slug)}
                  aria-pressed={on}
                  className={`v2-chip ${on ? "is-on" : ""}`}
                  title={
                    willClone
                      ? `Clone to ${loc.city} on save`
                      : willRemove
                      ? `Remove from ${loc.city} on save (delete custom row / hide seed)`
                      : on
                      ? `Currently at ${loc.city}`
                      : `Not at ${loc.city}`
                  }
                >
                  {loc.city}
                  {willClone && " +"}
                  {willRemove && " −"}
                </button>
              );
            })}
          </div>
          <p className="v2-field-desc">
            Check a location to clone this item there on save. Uncheck to
            remove (custom rows are deleted; seed rows are hidden and can
            be restored later).
          </p>
        </div>
        {initialLocations.filter((s) => s !== currentSlug).length > 0 && (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              padding: "0.625rem 0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--brand-soft, var(--surface-2))",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
            title="Propagate the field changes to twins of this item at other locations. Matched by name."
          >
            <input
              type="checkbox"
              checked={propagateAll}
              onChange={(e) => setPropagateAll(e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <strong>Apply price, cost &amp; description changes to all locations.</strong>
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--fg-muted)",
                  marginTop: 2,
                }}
              >
                Same item exists at{" "}
                {initialLocations
                  .filter((s) => s !== currentSlug)
                  .map((s) => activeLocations.find((l) => l.slug === s)?.city ?? s)
                  .join(", ")}
                . Identity fields (name, slug, SKU, modifiers) only change here.
              </span>
            </span>
          </label>
        )}
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
