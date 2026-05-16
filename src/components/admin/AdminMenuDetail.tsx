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
  type ModifierOption,
} from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";
import { Button, Card, CardBody, Input, Select, Textarea } from "./v2/ui";

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

function getBaseSlug(itemId: string): string {
  const m = itemId.match(/^[a-z]{2,4}-(.+)$/);
  return m ? m[1] : itemId;
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
  modifierGroups: ModifierGroup[];
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
    modifierGroups: [],
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
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
        modifierGroups: primary.modifierGroups
          ? JSON.parse(JSON.stringify(primary.modifierGroups))
          : [],
      };
      setChain(nextChain);
      setChainInitial(JSON.parse(JSON.stringify(nextChain)));

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
      const cleanedGroups = cleanedModifierGroups(chain.modifierGroups);
      const initGroups = cleanedModifierGroups(chainInitial.modifierGroups);
      const groupsChanged =
        JSON.stringify(cleanedGroups) !== JSON.stringify(initGroups);
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
        modifierGroups?: ModifierGroup[] | null;
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
      if (groupsChanged) {
        chainPatch.modifierGroups = cleanedGroups.length === 0 ? null : cleanedGroups;
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
          if (chainPatch.modifierGroups !== undefined) {
            seedPatch.modifierGroups = chainPatch.modifierGroups;
            customBody.modifierGroups = chainPatch.modifierGroups ?? [];
          }
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
              ...(cleanedGroups.length > 0 ? { modifierGroups: cleanedGroups } : {}),
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "var(--text-base)",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Per-location pricing
              </h2>
              <p
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-muted)",
                  margin: "2px 0 0",
                }}
              >
                Price + availability live per truck. Use “Apply to all” when a
                change should fan out.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={applyPriceToAll}
                disabled={busy}
                title="Copy the first row's price to every location"
              >
                Apply price to all
              </Button>
              {!hasRecipeAnywhere && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={applyCostToAll}
                  disabled={busy}
                  title="Copy the first row's cost to every location (no recipe attached)"
                >
                  Apply cost to all
                </Button>
              )}
              {isSeedAnywhere && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetOverridesEverywhere}
                  disabled={busy}
                  title="Drop every override and revert to seed values"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset overrides
                </Button>
              )}
            </div>
          </div>

          <ul className="v2-mng-loc-table" aria-label="Per-location pricing">
            <li className="v2-mng-loc-table-head">
              <span>Location</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>Cost</span>
              <span style={{ textAlign: "right" }}>Margin</span>
              <span style={{ textAlign: "center" }}>Status</span>
              <span aria-hidden />
            </li>
            {variants.map((v) => {
              const cur = perLoc[v.slug];
              if (!cur) return null;
              const priceNum =
                Math.round(parseFloat(cur.price || "0") * 100) || 0;
              const costNum =
                Math.round(parseFloat(cur.cost || "0") * 100) || 0;
              const m = marginPct(priceNum, costNum);
              const recipeLocked = Boolean(v.item?._hasRecipe);
              return (
                <li
                  key={v.slug}
                  className="v2-mng-loc-table-row"
                  data-missing={!cur.present ? "true" : undefined}
                  data-hidden={cur.hidden ? "true" : undefined}
                >
                  <span className="v2-mng-loc-table-city">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <strong>{v.city}</strong>
                    {v.item?._isCustom && (
                      <span className="v2-mng-tag v2-mng-tag-custom">custom</span>
                    )}
                    {v.item?._hasOverride && !v.item?._isCustom && (
                      <span className="v2-mng-tag v2-mng-tag-override">edited</span>
                    )}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {cur.present ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={cur.price}
                        onChange={(e) => setLocField(v.slug, "price", e.target.value)}
                        trailingAdornment={<span className="v2-muted">zł</span>}
                        aria-label={`Price at ${v.city}`}
                      />
                    ) : (
                      <span className="v2-muted">—</span>
                    )}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {cur.present ? (
                      recipeLocked ? (
                        <span
                          title="Computed from this item's recipe — edit ingredients in /admin/recipes."
                          style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
                        >
                          {formatPrice(v.item!.cost)}{" "}
                          <span className="v2-mng-cost-source">recipe</span>
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cur.cost}
                          onChange={(e) => setLocField(v.slug, "cost", e.target.value)}
                          trailingAdornment={<span className="v2-muted">zł</span>}
                          aria-label={`Cost at ${v.city}`}
                        />
                      )
                    ) : (
                      <span className="v2-muted">—</span>
                    )}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                    className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${marginTone(m)}`}
                  >
                    {cur.present ? `${m}%` : "—"}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      display: "flex",
                      justifyContent: "center",
                      gap: "0.25rem",
                    }}
                  >
                    {cur.present ? (
                      <>
                        <button
                          type="button"
                          className={`v2-mng-toggle ${cur.available ? "is-on" : ""}`}
                          onClick={() => setLocField(v.slug, "available", !cur.available)}
                          title={cur.available ? "Mark sold out" : "Mark available"}
                          aria-label={cur.available ? "Mark sold out" : "Mark available"}
                        >
                          {cur.available ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {cur.hidden && (
                          <span
                            className="v2-mng-tag v2-mng-tag-warning"
                            title="Soft-deleted at this location"
                          >
                            hidden
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="v2-mng-tag v2-mng-tag-warning">missing</span>
                    )}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {cur.present ? (
                      cur.hidden ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => restoreLocation(v.slug)}
                          title="Un-hide at this location"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => removeFromLocation(v.slug)}
                          style={{ color: "var(--danger)" }}
                          title={
                            v.item?._isCustom
                              ? "Permanently delete from this location"
                              : "Hide (restorable) at this location"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setLocField(v.slug, "present", true)}
                      >
                        + Add
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 600,
              margin: "0 0 4px",
            }}
          >
            Product (chain-wide)
          </h2>
          <p
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              margin: "0 0 0.75rem",
            }}
          >
            Name, description, category, tags, modifiers and packaging are
            uniform across every truck. Save propagates them to all{" "}
            {present.length} location{present.length === 1 ? "" : "s"}.
          </p>

          <div className="v2-stack-12">
            <Input
              label="Name"
              value={chain.name}
              onChange={(e) => setChain((c) => ({ ...c, name: e.target.value }))}
              description="Customer-facing item name."
            />
            <Input
              label="Item slug"
              value={chain.slug}
              onChange={() => {}}
              disabled
              description="Stable identifier — tied to historical orders. Rename via the API if you really need to."
            />
            <Input
              label="SKU"
              value={chain.sku}
              onChange={(e) => setChain((c) => ({ ...c, sku: e.target.value }))}
              placeholder="e.g. SI-PIZ-MARG-001"
              description="Operator-facing inventory / accounting code. Same SKU is applied everywhere."
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
            <Textarea
              label="Description"
              value={chain.description}
              onChange={(e) =>
                setChain((c) => ({ ...c, description: e.target.value }))
              }
              rows={4}
            />
            <div className="v2-field">
              <label className="v2-field-label">Tags</label>
              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
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
              <p className="v2-field-desc">
                Optional dietary markers shown on the menu card.
              </p>
            </div>
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
                id="detail-delivery-only"
                type="checkbox"
                checked={chain.deliveryOnly}
                onChange={(e) =>
                  setChain((c) => ({ ...c, deliveryOnly: e.target.checked }))
                }
                style={{ width: 16, height: 16 }}
              />
              <label
                htmlFor="detail-delivery-only"
                style={{ fontSize: "0.875rem", fontWeight: 500 }}
              >
                Delivery-only item
              </label>
              <span
                style={{
                  gridColumn: "1 / 3",
                  fontSize: "0.75rem",
                  color: "var(--fg-muted)",
                }}
              >
                Hide from dine-in/takeout. Pantry SKUs (frozen tiramisù, beer
                4-pack, branded olive oil) live here.
              </span>
              <span style={{ gridColumn: "1 / 3" }}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  label="Packaging cost (PLN, optional)"
                  value={chain.packagingStr}
                  onChange={(e) =>
                    setChain((c) => ({ ...c, packagingStr: e.target.value }))
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                  description="Per-unit box / wrap / napkin cost. Leave blank to use the category default."
                />
              </span>
            </div>
            <ModifierEditor
              groups={chain.modifierGroups}
              onChange={(g) => setChain((c) => ({ ...c, modifierGroups: g }))}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Modifier editor ─────────────────────────────────────────────────────
//
// Inline editor for ModifierGroup[]. Lives with the detail page since
// it's chain-wide — modifiers don't diverge per truck (audit §3 single
// source of truth for upsell options).

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
        options: [
          {
            id: `opt-${Math.random().toString(36).slice(2, 8)}`,
            label: "Standard",
            priceDelta: 0,
          },
        ],
      },
    ]);
  };
  const updateOption = (gi: number, oi: number, patch: Partial<ModifierOption>) => {
    update(gi, {
      options: groups[gi].options.map((o, idx) =>
        idx === oi ? { ...o, ...patch } : o,
      ),
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Item modifiers</p>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--fg-muted)",
              marginTop: "0.125rem",
            }}
          >
            Optional groups customers pick from at checkout. PriceDelta adds
            to the line; flagOnKds highlights on the kitchen ticket.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={add}>
          + Add group
        </Button>
      </div>

      {groups.length === 0 && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--fg-muted)",
            fontStyle: "italic",
          }}
        >
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: "0.5rem",
            }}
          >
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
                update(gi, {
                  minSelections: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
            <Input
              type="number"
              min={1}
              max={10}
              label="Max picks"
              value={String(g.maxSelections ?? 1)}
              onChange={(e) =>
                update(gi, {
                  maxSelections: Math.max(1, Number(e.target.value) || 1),
                })
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
                      priceDelta: Math.max(
                        0,
                        Math.round(parseFloat(e.target.value || "0") * 100),
                      ),
                    })
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  label={oi === 0 ? "Cost +zł" : undefined}
                  value={
                    typeof o.costDelta === "number"
                      ? (o.costDelta / 100).toFixed(2)
                      : ""
                  }
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
                  title="Highlight this option on the KDS ticket."
                >
                  <input
                    type="checkbox"
                    checked={!!o.flagOnKds}
                    onChange={(e) =>
                      updateOption(gi, oi, {
                        flagOnKds: e.target.checked || undefined,
                      })
                    }
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
