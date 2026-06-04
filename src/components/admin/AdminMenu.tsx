"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Coffee,
  Eye,
  EyeOff,
  IceCream,
  Pencil,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { formatPrice, getBaseSlug, marginPct, marginTone } from "@/lib/utils";
import { MENU_CATEGORY_LABELS, type MenuCategory, type ModifierGroup } from "@/data/types";
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
  PageHero,
  Select,
  Switch,
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

/** Format a possibly-varying numeric value across the chain as a compact
 *  range (`27,90–29,90 zł`) when locations diverge, or a single value when
 *  they agree. Caller pre-computes min/max so the same single-pass result
 *  feeds both this formatter and the variance check. */
function formatPriceRange(min: number, max: number): string {
  if (min === max) return formatPrice(min);
  return `${formatPrice(min)}–${formatPrice(max)}`;
}

export function AdminMenu() {
  return <AdminMenuDesktop />;
}

function AdminMenuDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();

  // The master+variants list is chain-wide — every product renders as one
  // row regardless of which trucks it lives at. We still track a "primary
  // lens" though, used by `unifyMenus` to pick which variant's name /
  // description / tags surface in the row when locations diverge. Default
  // to the global location switcher's pick, or the first active location.
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
  const [category, setCategory] = useState<MenuCategory | "all">("all");
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
      // One round trip when the session holds chain-wide scope — the
      // unparameterized GET returns { [slug]: items[] } directly. A
      // location-scoped manager (e.g. Kraków-only) hits 403 on that call
      // because withAdmin enforces unrestricted scope when locationParam
      // is absent; fall back to per-location fetches and silently skip
      // the ones their session can't read.
      const all = await fetch("/api/admin/menu");
      if (all.ok) {
        const byLoc = (await all.json()) as Record<string, MenuItemData[]>;
        setMenusByLocation(byLoc);
        return;
      }
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
    return unifiedItems.filter((u) => {
      if (u.hidden && !showHidden) return false;
      if (category !== "all" && u.category !== category) return false;
      return true;
    });
  }, [unifiedItems, category, showHidden]);

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

  return (
    <div className="v2-page">
      <PageHero
        title="Menu"
        subtitle={
          <>
            {unifiedItems.length} {unifiedItems.length === 1 ? "product" : "products"} across {activeLocations.length} location{activeLocations.length === 1 ? "" : "s"}
            {unavailableCount > 0 && ` · ${unavailableCount} hidden from customers`}
          </>
        }
        actions={
          <>
            {hiddenCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHidden((v) => !v)}
                leadingIcon={showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                aria-label={showHidden ? "Hide hidden" : "Show hidden"}
                title={showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreating(true)}
              leadingIcon={<Plus className="h-3.5 w-3.5" />}
              aria-label="Add item"
              title="Add item"
            />
          </>
        }
        filter={{
          value: category,
          onChange: (v) => setCategory(v as MenuCategory | "all"),
          ariaLabel: "Category filter",
          options: [
            { value: "all", label: "All", count: unifiedItems.length },
            ...categories.map((c) => ({
              value: c,
              label: MENU_CATEGORY_LABELS[c],
              count: unifiedItems.filter((u) => u.category === c).length,
            })),
          ],
        }}
      />

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
            boxShadow: "var(--shadow-md)",
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
        <div className="v2-page-loading">Loading Menu…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={UtensilsCrossed}
              title={unifiedItems.length === 0 ? "No menu items" : "No matches"}
              description={
                unifiedItems.length === 0
                  ? "Menu data lives in src/data/menus/*.ts. Add items there to see them here."
                  : "Pick another category."
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
                  {list.map((unified) => {
                    const primary = unified.primary;
                    // One sweep across the visible variants computes every
                    // value the row needs — price + cost min/max plus the
                    // worst (lowest) margin tone, no intermediate arrays.
                    // Hidden rows are excluded so soft-deleted trucks don't
                    // drag the min to zero or skew the margin colour.
                    let priceMin = Infinity;
                    let priceMax = -Infinity;
                    let costMin = Infinity;
                    let costMax = -Infinity;
                    let marginMin = Infinity;
                    let marginMax = -Infinity;
                    let seen = 0;
                    for (const l of unified.locations) {
                      if (l.item._hidden) continue;
                      const p = l.item.price;
                      const c = l.item.cost;
                      if (p < priceMin) priceMin = p;
                      if (p > priceMax) priceMax = p;
                      if (c < costMin) costMin = c;
                      if (c > costMax) costMax = c;
                      const m = marginPct(p, c);
                      if (m < marginMin) marginMin = m;
                      if (m > marginMax) marginMax = m;
                      seen++;
                    }
                    if (seen === 0) {
                      priceMin = priceMax = primary.price;
                      costMin = costMax = primary.cost;
                      marginMin = marginMax = marginPct(primary.price, primary.cost);
                    }
                    const priceVaries = priceMin !== priceMax;
                    const costVaries = costMin !== costMax;
                    const marginVaries = marginMin !== marginMax;
                    const worstTone = marginTone(marginMin);
                    const locCount = unified.locations.length;
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
                            locCount > 1
                              ? unified.available
                                ? `Mark sold out at all ${locCount} locations`
                                : `Mark available at all ${locCount} locations`
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
                          <div className="v2-mng-row-meta" aria-label="Chain summary">
                            <span>
                              {locCount === 1
                                ? unified.locations[0]?.city
                                : `${locCount} locations`}
                            </span>
                            {(priceVaries || costVaries) && (
                              <span className="v2-mng-row-meta-badge" title="Values differ across locations — open the detail page to compare.">
                                varies
                              </span>
                            )}
                            {unified.hasOverride && !priceVaries && !costVaries && (
                              <span className="v2-mng-row-meta-badge v2-mng-row-meta-badge-info">
                                uniform override
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className="v2-mng-val v2-mng-val-price tabular"
                          title={
                            priceVaries
                              ? `Range across ${locCount} location${locCount === 1 ? "" : "s"}`
                              : undefined
                          }
                        >
                          {priceVaries
                            ? formatPriceRange(priceMin, priceMax)
                            : formatPrice(priceMin)}
                        </span>
                        <span
                          className="v2-mng-val v2-mng-val-cost tabular"
                          data-recipe={primary._hasRecipe ? "true" : undefined}
                          title={
                            primary._hasRecipe
                              ? "Cost is computed from each location's recipe — edit ingredients in /admin/recipes."
                              : costVaries
                              ? `Cost varies across ${locCount} locations`
                              : primary._costSource === "override"
                              ? "Manual cost override."
                              : "Seed cost — no recipe yet."
                          }
                        >
                          {costVaries
                            ? formatPriceRange(costMin, costMax)
                            : formatPrice(costMin)}
                        </span>
                        <span
                          className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${worstTone} tabular`}
                          title={marginVaries ? `Range across ${locCount} locations` : undefined}
                        >
                          {marginVaries ? `${marginMin}–${marginMax}%` : `${marginMin}%`}
                        </span>

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
                            <Link
                              href={`/admin/menu/${unified.baseSlug}`}
                              className="v2-mng-edit"
                              aria-label={`Edit ${unified.name}`}
                              title={`Edit ${unified.name} — chain-wide details + per-location pricing`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {!unified.hidden && (
                            <button
                              type="button"
                              className="v2-mng-edit v2-mng-edit-danger"
                              onClick={() => deleteItem(primary)}
                              aria-label={`Delete ${unified.name}`}
                              title={
                                locCount > 1
                                  ? `Delete ${unified.name} — pick a location or "Delete everywhere" in the dialog.`
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

      <CreateItemDialog
        open={creating}
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
            <Switch
              checked={available}
              onChange={(v) => setAvailable(v)}
              disabled={!enabled.available}
              label="Available to customers"
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
            <Switch
              checked={deliveryOnly}
              onChange={(v) => setDeliveryOnly(v)}
              disabled={!enabled.deliveryOnly}
              label="Delivery-only"
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

function CreateItemDialog({ open, onClose, onCreate }: CreateItemDialogProps) {
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
  const [selectedLocs, setSelectedLocs] = useState<string[]>(
    activeLocations.map((l) => l.slug),
  );
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
      setSelectedLocs(activeLocations.map((l) => l.slug));
      setError(null);
      setBusy(false);
    }
  }, [open]);

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
      setSelectedLocs([]);
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
          <Switch
            checked={available}
            onChange={(v) => setAvailable(v)}
            label="Available to customers immediately"
          />
          Available to customers immediately
        </label>
      </div>
    </Dialog>
  );
}
