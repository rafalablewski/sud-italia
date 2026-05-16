"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  type MenuCategory,
  type ModifierGroup,
} from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug, marginPct, marginTone } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";
import { Button, Card, CardBody, Input, Select, Textarea } from "./v2/ui";
import { ModifierMatrix } from "./menu/ModifierEditor";

const MENU_TAGS: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[] = [
  "vegetarian",
  "vegan",
  "spicy",
  "gluten-free",
];

const CATEGORY_ORDER: MenuCategory[] = [
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

interface MenuItemData {
  id: string;
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
  _hasOverride: boolean;
  _hasRecipe?: boolean;
  _costSource?: "recipe" | "override" | "seed";
  _isCustom?: boolean;
  _hidden?: boolean;
}

const activeLocations = getActiveLocations();

interface LocationVariant {
  slug: string;
  city: string;
  item: MenuItemData | null;
}

interface PerLocationDraft {
  price: string;
  cost: string;
  available: boolean;
  hidden: boolean;
  // null when location has no variant; true when operator wants to add one on save
  present: boolean;
}

interface ChainDraft {
  name: string;
  slug: string;
  sku: string;
  description: string;
  category: MenuCategory;
  tags: string[];
  deliveryOnly: boolean;
  packagingStr: string;
}

function emptyChain(): ChainDraft {
  return {
    name: "",
    slug: "",
    sku: "",
    description: "",
    category: "pizza",
    tags: [],
    deliveryOnly: false,
    packagingStr: "",
  };
}

export function AdminMenuDetail({ baseSlug }: { baseSlug: string }) {
  const router = useRouter();
  const toast = useToast();

  const [variants, setVariants] = useState<LocationVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [chain, setChain] = useState<ChainDraft>(emptyChain);
  const [chainInitial, setChainInitial] = useState<ChainDraft>(emptyChain);
  const [perLoc, setPerLoc] = useState<Record<string, PerLocationDraft>>({});
  const [perLocInitial, setPerLocInitial] = useState<Record<string, PerLocationDraft>>({});
  /** Per-location modifier groups. Structural fields (group label, min/max,
   *  option label, KDS flag, costDelta) propagate to every location's array
   *  via `updateStructure`; pricing fields (priceDelta) write to one
   *  location only. The canonical structure for rendering is the first
   *  present variant's groups — if structures drift, the matrix lifts to
   *  the canonical and operators reconcile on save. */
  const [modifierGroupsByLoc, setModifierGroupsByLoc] = useState<
    Record<string, ModifierGroup[]>
  >({});
  const [modifierGroupsInitialByLoc, setModifierGroupsInitialByLoc] = useState<
    Record<string, ModifierGroup[]>
  >({});
  /** Lens for the modifier editor. Side-by-side columns don't scale
   *  past ~5 locations, so the editor shows one truck's prices at a
   *  time and operators flip the lens to retune another. Structural
   *  edits still propagate everywhere; only priceDelta / costDelta
   *  follow the lens. */
  const [modLens, setModLens] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // One round trip when the session has chain-wide scope; fall back
      // to per-location fetches for scope-limited sessions (withAdmin
      // 403s the unparameterized GET in that case). Mirrors AdminMenu.
      let byLoc: Record<string, MenuItemData[]> = {};
      const all = await fetch("/api/admin/menu");
      if (all.ok) {
        byLoc = (await all.json()) as Record<string, MenuItemData[]>;
      } else {
        const responses = await Promise.all(
          activeLocations.map((loc) =>
            fetch(`/api/admin/menu?location=${loc.slug}`).then((r) =>
              r.ok ? r.json() : ([] as MenuItemData[]),
            ),
          ),
        );
        activeLocations.forEach((loc, idx) => {
          byLoc[loc.slug] = responses[idx];
        });
      }

      // Find every variant matching baseSlug across locations.
      const found: LocationVariant[] = activeLocations.map((loc) => ({
        slug: loc.slug,
        city: loc.city,
        item:
          (byLoc[loc.slug] ?? []).find((i) => getBaseSlug(i.id) === baseSlug) ??
          null,
      }));
      setVariants(found);

      const present = found.filter((v) => v.item).map((v) => v.item!);
      if (present.length === 0) {
        setNotFound(true);
        return;
      }

      const primary = present[0];
      const nextChain: ChainDraft = {
        name: primary.name,
        slug: primary.id,
        sku: primary.sku ?? "",
        description: primary.description,
        category: primary.category,
        tags: primary.tags.slice(),
        deliveryOnly: Boolean(primary.deliveryOnly),
        packagingStr:
          typeof primary.packagingCost === "number"
            ? (primary.packagingCost / 100).toFixed(2)
            : "",
      };
      setChain(nextChain);
      setChainInitial(JSON.parse(JSON.stringify(nextChain)));

      const nextGroupsByLoc: Record<string, ModifierGroup[]> = {};
      for (const v of found) {
        nextGroupsByLoc[v.slug] = v.item?.modifierGroups
          ? JSON.parse(JSON.stringify(v.item.modifierGroups))
          : [];
      }
      setModifierGroupsByLoc(nextGroupsByLoc);
      setModifierGroupsInitialByLoc(JSON.parse(JSON.stringify(nextGroupsByLoc)));
      // Default the modifier lens to the first present location so the
      // editor lights up with real data on first paint, without forcing
      // operators to make a pick before they can scan. Keep the operator's
      // current pick across refetches if it's still a present location.
      const firstPresentSlug = found.find((v) => v.item)?.slug ?? "";
      setModLens((prev) =>
        prev && found.find((v) => v.slug === prev)?.item ? prev : firstPresentSlug,
      );

      const nextPerLoc: Record<string, PerLocationDraft> = {};
      for (const v of found) {
        if (v.item) {
          nextPerLoc[v.slug] = {
            price: (v.item.price / 100).toFixed(2),
            cost: (v.item.cost / 100).toFixed(2),
            available: v.item.available,
            hidden: Boolean(v.item._hidden),
            present: true,
          };
        } else {
          nextPerLoc[v.slug] = {
            price: (primary.price / 100).toFixed(2),
            cost: (primary.cost / 100).toFixed(2),
            available: true,
            hidden: false,
            present: false,
          };
        }
      }
      setPerLoc(nextPerLoc);
      setPerLocInitial(JSON.parse(JSON.stringify(nextPerLoc)));
    } finally {
      setLoading(false);
    }
  }, [baseSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const present = variants.filter((v) => v.item) as Array<
    LocationVariant & { item: MenuItemData }
  >;
  const isSeedAnywhere = present.some((v) => !v.item._isCustom);
  const hasRecipeAnywhere = present.some((v) => v.item._hasRecipe);

  const priceMin = useMemo(
    () => (present.length ? Math.min(...present.map((v) => v.item.price)) : 0),
    [present],
  );
  const priceMax = useMemo(
    () => (present.length ? Math.max(...present.map((v) => v.item.price)) : 0),
    [present],
  );
  const overrideCount = useMemo(
    () => present.filter((v) => v.item._hasOverride).length,
    [present],
  );

  const toggleTag = (tag: string) => {
    setChain((c) => ({
      ...c,
      tags: c.tags.includes(tag)
        ? c.tags.filter((t) => t !== tag)
        : [...c.tags, tag],
    }));
  };

  const setLocField = <K extends keyof PerLocationDraft>(
    slug: string,
    key: K,
    value: PerLocationDraft[K],
  ) => {
    setPerLoc((prev) => ({ ...prev, [slug]: { ...prev[slug], [key]: value } }));
  };

  const applyPriceToAll = () => {
    const first = present[0];
    if (!first) return;
    const v = perLoc[first.slug]?.price ?? (first.item.price / 100).toFixed(2);
    setPerLoc((prev) => {
      const next = { ...prev };
      for (const slug of Object.keys(next)) next[slug] = { ...next[slug], price: v };
      return next;
    });
  };

  const applyCostToAll = () => {
    const first = present[0];
    if (!first) return;
    const v = perLoc[first.slug]?.cost ?? (first.item.cost / 100).toFixed(2);
    setPerLoc((prev) => {
      const next = { ...prev };
      for (const slug of Object.keys(next)) next[slug] = { ...next[slug], cost: v };
      return next;
    });
  };

  const resetOverridesEverywhere = async () => {
    const seedIds = present.filter((v) => !v.item._isCustom).map((v) => v.item.id);
    if (seedIds.length === 0) {
      toast.info("Nothing to reset", "Only custom rows here.");
      return;
    }
    if (!confirm(`Drop overrides for ${seedIds.length} location(s)? Reverts to seed price / cost / description.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/menu/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", ids: seedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Reset failed", err?.error);
        return;
      }
      toast.success("Overrides reset", `${seedIds.length} location(s).`);
      await fetchData();
    } finally {
      setBusy(false);
    }
  };

  const removeFromLocation = async (slug: string) => {
    const v = variants.find((x) => x.slug === slug);
    if (!v?.item) return;
    const cityName = v.city;
    if (
      !confirm(
        v.item._isCustom
          ? `Permanently delete this item from ${cityName}?`
          : `Hide this item at ${cityName}? (restorable via Show hidden)`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/menu/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: [v.item.id], scope: "current" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not remove", err?.error);
        return;
      }
      toast.success(`Removed from ${cityName}`);
      await fetchData();
    } finally {
      setBusy(false);
    }
  };

  const restoreLocation = async (slug: string) => {
    const v = variants.find((x) => x.slug === slug);
    if (!v?.item) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: { [v.item.id]: { hidden: null } } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not restore", err?.error);
        return;
      }
      toast.success(`Restored at ${v.city}`);
      await fetchData();
    } finally {
      setBusy(false);
    }
  };

  const cleanedModifierGroups = (groups: ModifierGroup[]): ModifierGroup[] =>
    groups
      .filter((g) => g.label.trim().length > 0 && g.options.length > 0)
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.label.trim().length > 0),
      }))
      .filter((g) => g.options.length > 0);

  const save = async () => {
    if (present.length === 0) {
      toast.error("Nothing to save", "Add the product to at least one location first.");
      return;
    }
    const trimmedName = chain.name.trim();
    if (!trimmedName) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      const issues: string[] = [];

      // Chain-wide diff — applied uniformly to every present variant. The
      // bulk-edit endpoint excludes name/sku/modifierGroups, so we route
      // through PUT /api/admin/menu (seed) + PATCH /custom (custom) and
      // batch them per variant rather than a single bulk call.
      const packagingRaw = chain.packagingStr.trim();
      const nextPackaging: number | null =
        packagingRaw === ""
          ? null
          : Math.max(0, Math.round(parseFloat(packagingRaw || "0") * 100));
      const initPackaging =
        chainInitial.packagingStr === ""
          ? null
          : Math.max(0, Math.round(parseFloat(chainInitial.packagingStr) * 100));
      const trimmedSku = chain.sku.trim();

      type ChainPatch = {
        name?: string;
        description?: string;
        category?: MenuCategory;
        tags?: string[];
        sku?: string | null;
        deliveryOnly?: boolean | null;
        packagingCost?: number | null;
      };
      const chainPatch: ChainPatch = {};
      if (trimmedName !== chainInitial.name.trim()) chainPatch.name = trimmedName;
      if (chain.description !== chainInitial.description)
        chainPatch.description = chain.description;
      if (chain.category !== chainInitial.category)
        chainPatch.category = chain.category;
      const tagsChanged =
        chain.tags.length !== chainInitial.tags.length ||
        chain.tags.some((t) => !chainInitial.tags.includes(t));
      if (tagsChanged) chainPatch.tags = chain.tags;
      if (trimmedSku !== chainInitial.sku.trim()) {
        chainPatch.sku = trimmedSku === "" ? null : trimmedSku;
      }
      if (Boolean(chain.deliveryOnly) !== Boolean(chainInitial.deliveryOnly)) {
        chainPatch.deliveryOnly = chain.deliveryOnly ? true : null;
      }
      if (nextPackaging !== initPackaging) {
        chainPatch.packagingCost = nextPackaging;
      }
      const hasChainChange = Object.keys(chainPatch).length > 0;

      // For each present variant, merge chain-wide patch + per-location
      // diff and route to the right endpoint.
      const seedUpdates: Record<string, Record<string, unknown>> = {};
      const customPromises: Promise<{ id: string; ok: boolean }>[] = [];
      for (const v of present) {
        const cur = perLoc[v.slug];
        const init = perLocInitial[v.slug];
        if (!cur || !init) continue;
        const seedPatch: Record<string, unknown> = {};
        const customBody: Record<string, unknown> = {};

        // Chain-wide fields — same values everywhere.
        if (hasChainChange) {
          if (chainPatch.name !== undefined) {
            seedPatch.name = chainPatch.name;
            customBody.name = chainPatch.name;
          }
          if (chainPatch.description !== undefined) {
            seedPatch.description = chainPatch.description;
            customBody.description = chainPatch.description;
          }
          if (chainPatch.category !== undefined) {
            seedPatch.category = chainPatch.category;
            customBody.category = chainPatch.category;
          }
          if (chainPatch.tags !== undefined) {
            seedPatch.tags = chainPatch.tags;
            customBody.tags = chainPatch.tags;
          }
          if (chainPatch.sku !== undefined) {
            // PUT accepts null to clear; PATCH/custom expects string ("" = empty).
            seedPatch.sku = chainPatch.sku;
            customBody.sku = chainPatch.sku ?? "";
          }
          if (chainPatch.deliveryOnly !== undefined) {
            seedPatch.deliveryOnly = chainPatch.deliveryOnly;
            customBody.deliveryOnly = chainPatch.deliveryOnly ?? false;
          }
          if (chainPatch.packagingCost !== undefined) {
            seedPatch.packagingCost = chainPatch.packagingCost;
            customBody.packagingCost = chainPatch.packagingCost ?? 0;
          }
        }

        // Per-location modifier groups — structural fields are mirrored
        // across locations via updateStructure, but priceDelta/costDelta
        // diverge per truck. Diff each variant's groups independently and
        // include the post-cleanup array in the patch when changed.
        const curGroups = cleanedModifierGroups(modifierGroupsByLoc[v.slug] ?? []);
        const initGroups = cleanedModifierGroups(modifierGroupsInitialByLoc[v.slug] ?? []);
        if (JSON.stringify(curGroups) !== JSON.stringify(initGroups)) {
          seedPatch.modifierGroups = curGroups.length === 0 ? null : curGroups;
          customBody.modifierGroups = curGroups;
        }

        // Per-location fields.
        const nextPrice = Math.max(
          0,
          Math.round(parseFloat(cur.price || "0") * 100),
        );
        const initPrice = Math.max(
          0,
          Math.round(parseFloat(init.price || "0") * 100),
        );
        if (nextPrice !== initPrice) {
          seedPatch.price = nextPrice;
          customBody.price = nextPrice;
        }
        if (!v.item._hasRecipe) {
          const nextCost = Math.max(
            0,
            Math.round(parseFloat(cur.cost || "0") * 100),
          );
          const initCost = Math.max(
            0,
            Math.round(parseFloat(init.cost || "0") * 100),
          );
          if (nextCost !== initCost) {
            seedPatch.cost = nextCost;
            customBody.cost = nextCost;
          }
        }
        if (cur.available !== init.available) {
          seedPatch.available = cur.available;
          customBody.available = cur.available;
        }
        // `hidden` only applies to seed rows — custom rows model removal
        // via hard-delete. Skip silently for customs.
        if (cur.hidden !== init.hidden) {
          seedPatch.hidden = cur.hidden ? true : null;
        }

        if (v.item._isCustom) {
          if (Object.keys(customBody).length === 0) continue;
          customPromises.push(
            fetch(`/api/admin/menu/custom?id=${encodeURIComponent(v.item.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(customBody),
            }).then((r) => ({ id: v.item.id, ok: r.ok })),
          );
        } else {
          if (Object.keys(seedPatch).length === 0) continue;
          seedUpdates[v.item.id] = seedPatch;
        }
      }

      if (Object.keys(seedUpdates).length > 0) {
        const res = await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: seedUpdates }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          issues.push(`seed updates (${err?.error || res.status})`);
        }
      }
      if (customPromises.length > 0) {
        const results = await Promise.all(customPromises);
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) issues.push(`${failed.length} custom row(s)`);
      }

      // Add to newly-checked locations (present went false → true).
      const additions = variants.filter(
        (v) => perLoc[v.slug]?.present && !perLocInitial[v.slug]?.present,
      );
      if (additions.length > 0) {
        // Newly-added rows inherit the canonical modifier structure with
        // its priceDelta values, then drift per-location from there.
        const canonicalAddGroups = cleanedModifierGroups(
          present[0] ? modifierGroupsByLoc[present[0].slug] ?? [] : [],
        );
        const cloneResults = await Promise.all(
          additions.map(async (a) => {
            const draft = perLoc[a.slug];
            const price = Math.max(
              0,
              Math.round(parseFloat(draft.price || "0") * 100),
            );
            const cost = Math.max(
              0,
              Math.round(parseFloat(draft.cost || "0") * 100),
            );
            const prefix = a.slug.slice(0, 3) || "loc";
            const id = `${prefix}-${baseSlug}`;
            const body = {
              id,
              locationSlug: a.slug,
              name: trimmedName,
              description: chain.description,
              price,
              cost,
              category: chain.category,
              tags: chain.tags,
              available: draft.available,
              ...(trimmedSku ? { sku: trimmedSku } : {}),
              ...(chain.deliveryOnly ? { deliveryOnly: true } : {}),
              ...(nextPackaging !== null ? { packagingCost: nextPackaging } : {}),
              ...(canonicalAddGroups.length > 0
                ? { modifierGroups: canonicalAddGroups }
                : {}),
            };
            const res = await fetch("/api/admin/menu/custom", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { slug: a.slug, ok: res.ok };
          }),
        );
        const failed = cloneResults.filter((r) => !r.ok);
        if (failed.length > 0) issues.push(`add to ${failed.length} location(s)`);
      }

      if (issues.length > 0) {
        toast.error("Some changes failed", issues.join(", "));
      } else {
        toast.success("Saved");
      }
      await fetchData();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading product…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Product not found</h1>
            <p className="v2-page-subtitle">
              No menu row matches the base slug{" "}
              <code>{baseSlug}</code>.
            </p>
          </div>
        </header>
        <Card>
          <CardBody>
            <Button variant="ghost" onClick={() => router.push("/admin/menu")}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to menu
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const primary = present[0]!.item;
  const isVarying = priceMin !== priceMax;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
            }}
          >
            <Link
              href="/admin/menu"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ArrowLeft className="h-3 w-3" /> Menu
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span>{chain.name || primary.name}</span>
          </nav>
          <h1 className="v2-page-title">{chain.name || primary.name}</h1>
          <p className="v2-page-subtitle">
            {present.length} of {activeLocations.length} location
            {activeLocations.length === 1 ? "" : "s"}
            {" · "}
            {isVarying
              ? `${formatPrice(priceMin)}–${formatPrice(priceMax)}`
              : formatPrice(priceMin)}
            {overrideCount > 0 && ` · ${overrideCount} override${overrideCount === 1 ? "" : "s"}`}
            {hasRecipeAnywhere && " · cost from recipe"}
          </p>
        </div>
        <div className="v2-page-actions">
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/menu")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button variant="primary" size="sm" loading={busy} onClick={save}>
            <Check className="h-3.5 w-3.5" /> Save changes
          </Button>
        </div>
      </header>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Per-location pricing</h2>
            <div className="v2-detail-head-actions">
              <button
                type="button"
                onClick={applyPriceToAll}
                disabled={busy}
                title="Copy the first row's price to every location"
              >
                → all prices
              </button>
              {!hasRecipeAnywhere && (
                <button
                  type="button"
                  onClick={applyCostToAll}
                  disabled={busy}
                  title="Copy the first row's cost to every location (no recipe attached)"
                >
                  → all costs
                </button>
              )}
              {isSeedAnywhere && (
                <button
                  type="button"
                  onClick={resetOverridesEverywhere}
                  disabled={busy}
                  title="Drop every override and revert to seed values"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
          </div>

          <div className="v2-loc-rows" role="list" aria-label="Per-location pricing">
            {variants.map((v) => {
              const cur = perLoc[v.slug];
              if (!cur) return null;
              const priceNum = Math.round(parseFloat(cur.price || "0") * 100) || 0;
              const costNum = Math.round(parseFloat(cur.cost || "0") * 100) || 0;
              const m = marginPct(priceNum, costNum);
              const recipeLocked = Boolean(v.item?._hasRecipe);
              const state = !cur.present
                ? "missing"
                : cur.hidden
                ? "hidden"
                : "live";
              return (
                <div
                  key={v.slug}
                  role="listitem"
                  className="v2-loc-row"
                  data-state={state}
                >
                  <span className="v2-loc-row-name">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <strong>{v.city}</strong>
                    {v.item?._isCustom && (
                      <span className="v2-loc-row-tag v2-loc-row-tag-custom">
                        custom
                      </span>
                    )}
                    {v.item?._hasOverride && !v.item?._isCustom && (
                      <span className="v2-loc-row-tag v2-loc-row-tag-edited">
                        edited
                      </span>
                    )}
                    {cur.hidden && (
                      <span className="v2-loc-row-tag v2-loc-row-tag-hidden">
                        hidden
                      </span>
                    )}
                    {!cur.present && (
                      <span className="v2-loc-row-tag">not at this truck</span>
                    )}
                  </span>

                  {cur.present ? (
                    <>
                      <div className="v2-mod-money">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cur.price}
                          onChange={(e) =>
                            setLocField(v.slug, "price", e.target.value)
                          }
                          aria-label={`Price at ${v.city}`}
                        />
                        <span className="v2-mod-money-suffix">zł</span>
                      </div>

                      {recipeLocked ? (
                        <span
                          className="v2-loc-row-recipe"
                          title="Computed from this item's recipe — edit ingredients in /admin/recipes."
                        >
                          {formatPrice(v.item!.cost)}
                          <span className="v2-loc-row-recipe-suffix">
                            recipe
                          </span>
                        </span>
                      ) : (
                        <div className="v2-mod-money">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={cur.cost}
                            onChange={(e) =>
                              setLocField(v.slug, "cost", e.target.value)
                            }
                            aria-label={`Cost at ${v.city}`}
                          />
                          <span className="v2-mod-money-suffix">zł</span>
                        </div>
                      )}

                      <span
                        className={`v2-loc-row-margin v2-loc-row-margin-${marginTone(m)}`}
                      >
                        {m}%
                      </span>

                      <span className="v2-loc-row-actions">
                        <button
                          type="button"
                          className="v2-mod-icon-btn"
                          data-tone="neutral"
                          data-on={cur.available ? "true" : "false"}
                          onClick={() =>
                            setLocField(v.slug, "available", !cur.available)
                          }
                          title={
                            cur.available
                              ? "Available — click to mark sold out"
                              : "Sold out — click to mark available"
                          }
                          aria-label={
                            cur.available
                              ? "Mark sold out at this location"
                              : "Mark available at this location"
                          }
                        >
                          {cur.available ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {cur.hidden ? (
                          <button
                            type="button"
                            className="v2-mod-icon-btn"
                            data-tone="neutral"
                            disabled={busy}
                            onClick={() => restoreLocation(v.slug)}
                            title="Un-hide at this location"
                            aria-label={`Restore at ${v.city}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="v2-mod-icon-btn"
                            disabled={busy}
                            onClick={() => removeFromLocation(v.slug)}
                            title={
                              v.item?._isCustom
                                ? "Permanently delete from this location"
                                : "Hide (restorable) at this location"
                            }
                            aria-label={`Remove from ${v.city}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="v2-loc-row-empty">
                        No price yet — add the product to start serving here.
                      </span>
                      <button
                        type="button"
                        className="v2-loc-row-add"
                        disabled={busy}
                        onClick={() => setLocField(v.slug, "present", true)}
                      >
                        + Add to truck
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Product · chain-wide</h2>
          </div>

          <div className="v2-detail-form">
            <Input
              label="Name"
              value={chain.name}
              onChange={(e) => setChain((c) => ({ ...c, name: e.target.value }))}
            />
            <div className="v2-detail-form-row" data-cols="3">
              <Input
                label="Slug"
                value={chain.slug}
                onChange={() => {}}
                disabled
                description="Tied to historical orders."
              />
              <Input
                label="SKU"
                value={chain.sku}
                onChange={(e) => setChain((c) => ({ ...c, sku: e.target.value }))}
                placeholder="e.g. SI-PIZ-MARG-001"
              />
              <Select
                label="Category"
                value={chain.category}
                onChange={(e) =>
                  setChain((c) => ({ ...c, category: e.target.value as MenuCategory }))
                }
                options={CATEGORY_ORDER.map((cc) => ({
                  value: cc,
                  label: MENU_CATEGORY_LABELS[cc],
                }))}
              />
            </div>
            <Textarea
              label="Description"
              value={chain.description}
              onChange={(e) =>
                setChain((c) => ({ ...c, description: e.target.value }))
              }
              rows={3}
            />
            <div className="v2-detail-tags-row">
              <span className="v2-detail-tags-row-label">Tags</span>
              {MENU_TAGS.map((tag) => {
                const on = chain.tags.includes(tag);
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
            <div className="v2-detail-form-row" data-cols="2">
              <label className="v2-detail-inline-check">
                <input
                  type="checkbox"
                  checked={chain.deliveryOnly}
                  onChange={(e) =>
                    setChain((c) => ({ ...c, deliveryOnly: e.target.checked }))
                  }
                />
                Delivery-only item
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                label="Packaging cost"
                value={chain.packagingStr}
                onChange={(e) =>
                  setChain((c) => ({ ...c, packagingStr: e.target.value }))
                }
                trailingAdornment={<span className="v2-muted">zł</span>}
                placeholder="Category default"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Modifiers</h2>
          </div>
          <ModifierMatrix
            present={present}
            groupsByLoc={modifierGroupsByLoc}
            setGroupsByLoc={setModifierGroupsByLoc}
            selectedLoc={modLens}
            onSelectLoc={setModLens}
          />
        </CardBody>
      </Card>
    </div>
  );
}

