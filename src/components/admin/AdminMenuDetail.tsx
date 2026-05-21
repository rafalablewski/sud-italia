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
  type NutritionInfo,
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
  // Audit §11.1 — per-item regulatory disclosures.
  halalStatus?: "halal" | "non-halal" | "uncertified";
  nutriGrade?: "A" | "B" | "C" | "D";
  containsPork?: boolean;
  containsAlcohol?: boolean;
  nutrition?: NutritionInfo;
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

/** Per-location regulatory + nutrition draft. Independent from the
 *  product / pricing drafts because operators tune disclosures per
 *  truck (e.g. only the SG truck tags items with halalStatus). All
 *  fields are nullable — empty / "" = "no claim", which clears any
 *  override and falls back to the seed value (or shows nothing). */
interface DietaryDraft {
  caloriesStr: string;
  halalStatus: "" | "halal" | "non-halal" | "uncertified";
  nutriGrade: "" | "A" | "B" | "C" | "D";
  containsPork: boolean;
  containsAlcohol: boolean;
}

function emptyDietary(): DietaryDraft {
  return {
    caloriesStr: "",
    halalStatus: "",
    nutriGrade: "",
    containsPork: false,
    containsAlcohol: false,
  };
}

function dietaryFromItem(item: MenuItemData): DietaryDraft {
  return {
    caloriesStr:
      typeof item.nutrition?.calories === "number"
        ? String(item.nutrition.calories)
        : "",
    halalStatus: item.halalStatus ?? "",
    nutriGrade: item.nutriGrade ?? "",
    containsPork: Boolean(item.containsPork),
    containsAlcohol: Boolean(item.containsAlcohol),
  };
}

interface ChainDraft {
  name: string;
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

  /** Product fields are presented chain-wide by default but stored
   *  per-variant — every active location keeps its own draft so an
   *  operator can override a name, description, or any other field
   *  for one truck without forcing every truck to match. The single
   *  `activeLoc` lens below the per-location pricing card picks
   *  which draft these inputs read + write to. */
  const [chainByLoc, setChainByLoc] = useState<Record<string, ChainDraft>>({});
  const [chainInitialByLoc, setChainInitialByLoc] = useState<Record<string, ChainDraft>>({});
  const [perLoc, setPerLoc] = useState<Record<string, PerLocationDraft>>({});
  const [perLocInitial, setPerLocInitial] = useState<Record<string, PerLocationDraft>>({});
  const [dietaryByLoc, setDietaryByLoc] = useState<Record<string, DietaryDraft>>({});
  const [dietaryInitialByLoc, setDietaryInitialByLoc] = useState<
    Record<string, DietaryDraft>
  >({});
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
  /** Per-location item ID (slug). Seed items aren't renamable (their id
   *  lives in src/data/menus/*.ts); custom items can be renamed via
   *  PATCH /api/admin/menu/custom with `newId`. */
  const [slugByLoc, setSlugByLoc] = useState<Record<string, string>>({});
  const [slugInitialByLoc, setSlugInitialByLoc] = useState<Record<string, string>>({});
  /** Single shared lens — picks the active truck for everything
   *  editable below the per-location pricing card (slug, product
   *  fields, modifier prices). Defaults to the first present location
   *  on mount; persisted across saves so the operator stays oriented. */
  const [activeLoc, setActiveLoc] = useState<string>("");

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

      // Per-variant product draft — every present location seeds its own
      // ChainDraft so an operator can override a name / description / etc
      // for one truck. Most operators never touch these so the variants
      // stay identical in practice.
      const nextChainByLoc: Record<string, ChainDraft> = {};
      const nextSlugByLoc: Record<string, string> = {};
      const nextGroupsByLoc: Record<string, ModifierGroup[]> = {};
      const nextDietaryByLoc: Record<string, DietaryDraft> = {};
      for (const v of found) {
        if (!v.item) continue;
        nextChainByLoc[v.slug] = {
          name: v.item.name,
          sku: v.item.sku ?? "",
          description: v.item.description,
          category: v.item.category,
          tags: v.item.tags.slice(),
          deliveryOnly: Boolean(v.item.deliveryOnly),
          packagingStr:
            typeof v.item.packagingCost === "number"
              ? (v.item.packagingCost / 100).toFixed(2)
              : "",
        };
        nextSlugByLoc[v.slug] = v.item.id;
        nextGroupsByLoc[v.slug] = v.item.modifierGroups
          ? JSON.parse(JSON.stringify(v.item.modifierGroups))
          : [];
        nextDietaryByLoc[v.slug] = dietaryFromItem(v.item);
      }
      setChainByLoc(nextChainByLoc);
      setChainInitialByLoc(JSON.parse(JSON.stringify(nextChainByLoc)));
      setSlugByLoc(nextSlugByLoc);
      setSlugInitialByLoc({ ...nextSlugByLoc });
      setModifierGroupsByLoc(nextGroupsByLoc);
      setModifierGroupsInitialByLoc(JSON.parse(JSON.stringify(nextGroupsByLoc)));
      setDietaryByLoc(nextDietaryByLoc);
      setDietaryInitialByLoc(JSON.parse(JSON.stringify(nextDietaryByLoc)));

      // One shared lens — defaults to the first present location and
      // sticks across refetches if the operator's previous pick is
      // still present.
      const firstPresentSlug = found.find((v) => v.item)?.slug ?? "";
      setActiveLoc((prev) =>
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

  // Derived per-lens view into the product draft map. `chain` keeps
  // its old shape so every JSX handler below can stay as
  // setChain((c) => ({ ...c, field: value })) — the helper just routes
  // the write to chainByLoc[activeLoc]. The save loop reads
  // chainInitialByLoc[v.slug] directly per-variant.
  const chain = chainByLoc[activeLoc] ?? emptyChain();
  const setChain = (updater: (prev: ChainDraft) => ChainDraft) => {
    setChainByLoc((prev) => ({
      ...prev,
      [activeLoc]: updater(prev[activeLoc] ?? emptyChain()),
    }));
  };
  const dietary = dietaryByLoc[activeLoc] ?? emptyDietary();
  const setDietary = (updater: (prev: DietaryDraft) => DietaryDraft) => {
    setDietaryByLoc((prev) => ({
      ...prev,
      [activeLoc]: updater(prev[activeLoc] ?? emptyDietary()),
    }));
  };
  const activeVariant = present.find((v) => v.slug === activeLoc);
  const activeCity = activeVariant?.city ?? activeLoc;

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
    // Validate every present variant has a non-empty name — operators can
    // diverge fields per-location but a blank name would render an
    // unselectable menu card.
    const blankNames = present.filter(
      (v) => !(chainByLoc[v.slug]?.name ?? "").trim(),
    );
    if (blankNames.length > 0) {
      toast.error(
        "Name required",
        `Blank at ${blankNames.map((v) => v.city).join(", ")}.`,
      );
      return;
    }
    setBusy(true);
    try {
      const issues: string[] = [];

      // Per-variant diff. Each present location keeps its own ChainDraft
      // so an operator can override a name / description / etc. at one
      // truck without affecting the others; same goes for slug, modifier
      // pricing, and the per-location pricing inputs. The PUT seed path
      // and PATCH custom path each accept the full field set so we can
      // batch every diverged field per row.
      const seedUpdates: Record<string, Record<string, unknown>> = {};
      const customPromises: Promise<{ id: string; ok: boolean }>[] = [];
      for (const v of present) {
        const cur = perLoc[v.slug];
        const init = perLocInitial[v.slug];
        const chainCur = chainByLoc[v.slug] ?? emptyChain();
        const chainInit = chainInitialByLoc[v.slug] ?? emptyChain();
        if (!cur || !init) continue;
        const seedPatch: Record<string, unknown> = {};
        const customBody: Record<string, unknown> = {};

        // Per-variant product fields. Name, category, description and
        // tags are chain-wide (locked + disabled in the UI), so they
        // intentionally don't flow into the diff — operators rename /
        // recategorise / rewrite / retag through a different path.
        // Everything below is per-location.
        const trimmedSku = chainCur.sku.trim();
        if (trimmedSku !== chainInit.sku.trim()) {
          // PUT accepts null to clear; PATCH/custom expects string ("" = empty).
          seedPatch.sku = trimmedSku === "" ? null : trimmedSku;
          customBody.sku = trimmedSku;
        }
        if (Boolean(chainCur.deliveryOnly) !== Boolean(chainInit.deliveryOnly)) {
          seedPatch.deliveryOnly = chainCur.deliveryOnly ? true : null;
          customBody.deliveryOnly = chainCur.deliveryOnly;
        }
        const curPackaging =
          chainCur.packagingStr.trim() === ""
            ? null
            : Math.max(
                0,
                Math.round(parseFloat(chainCur.packagingStr.trim()) * 100),
              );
        const initPackaging =
          chainInit.packagingStr.trim() === ""
            ? null
            : Math.max(
                0,
                Math.round(parseFloat(chainInit.packagingStr.trim()) * 100),
              );
        if (curPackaging !== initPackaging) {
          seedPatch.packagingCost = curPackaging;
          customBody.packagingCost = curPackaging ?? 0;
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

        // Audit §11.1 — per-item dietary + nutrition fields. Diffed per
        // variant against the snapshot we captured on load. Empty string
        // / unset clears the override (null), so operators can withdraw
        // a halal claim or kcal value cleanly.
        const dCur = dietaryByLoc[v.slug] ?? emptyDietary();
        const dInit = dietaryInitialByLoc[v.slug] ?? emptyDietary();
        if (dCur.halalStatus !== dInit.halalStatus) {
          const value = dCur.halalStatus === "" ? null : dCur.halalStatus;
          seedPatch.halalStatus = value;
          customBody.halalStatus = value;
        }
        if (dCur.nutriGrade !== dInit.nutriGrade) {
          const value = dCur.nutriGrade === "" ? null : dCur.nutriGrade;
          seedPatch.nutriGrade = value;
          customBody.nutriGrade = value;
        }
        if (Boolean(dCur.containsPork) !== Boolean(dInit.containsPork)) {
          seedPatch.containsPork = dCur.containsPork ? true : null;
          customBody.containsPork = dCur.containsPork;
        }
        if (Boolean(dCur.containsAlcohol) !== Boolean(dInit.containsAlcohol)) {
          seedPatch.containsAlcohol = dCur.containsAlcohol ? true : null;
          customBody.containsAlcohol = dCur.containsAlcohol;
        }
        const curKcalRaw = dCur.caloriesStr.trim();
        const initKcalRaw = dInit.caloriesStr.trim();
        if (curKcalRaw !== initKcalRaw) {
          if (curKcalRaw === "") {
            seedPatch.calories = null;
            customBody.calories = null;
          } else {
            const n = Math.max(0, Math.round(Number(curKcalRaw)));
            if (Number.isFinite(n)) {
              seedPatch.calories = n;
              customBody.calories = n;
            }
          }
        }

        // Per-location slug rename (custom items only). Seed slugs live
        // in code so a server PATCH would reject; the input is disabled
        // for seed variants in the UI as a guard.
        const curSlug = slugByLoc[v.slug]?.trim() ?? "";
        const initSlug = slugInitialByLoc[v.slug] ?? "";
        if (
          v.item._isCustom &&
          curSlug &&
          curSlug !== initSlug &&
          /^[a-z0-9-]{3,60}$/.test(curSlug)
        ) {
          customBody.newId = curSlug;
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
      // Use the active lens' chain draft as the template — operator's
      // most recent picks for name / description / etc carry over.
      const additions = variants.filter(
        (v) => perLoc[v.slug]?.present && !perLocInitial[v.slug]?.present,
      );
      if (additions.length > 0) {
        const template = chainByLoc[activeLoc] ?? emptyChain();
        const templateDietary = dietaryByLoc[activeLoc] ?? emptyDietary();
        const templatePackaging =
          template.packagingStr.trim() === ""
            ? null
            : Math.max(
                0,
                Math.round(parseFloat(template.packagingStr.trim()) * 100),
              );
        const canonicalAddGroups = cleanedModifierGroups(
          modifierGroupsByLoc[activeLoc] ?? [],
        );
        const templateKcalRaw = templateDietary.caloriesStr.trim();
        const templateKcal =
          templateKcalRaw === ""
            ? null
            : (() => {
                const n = Math.max(0, Math.round(Number(templateKcalRaw)));
                return Number.isFinite(n) ? n : null;
              })();
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
              name: template.name.trim(),
              description: template.description,
              price,
              cost,
              category: template.category,
              tags: template.tags,
              available: draft.available,
              ...(template.sku.trim() ? { sku: template.sku.trim() } : {}),
              ...(template.deliveryOnly ? { deliveryOnly: true } : {}),
              ...(templatePackaging !== null
                ? { packagingCost: templatePackaging }
                : {}),
              ...(canonicalAddGroups.length > 0
                ? { modifierGroups: canonicalAddGroups }
                : {}),
              ...(templateDietary.halalStatus
                ? { halalStatus: templateDietary.halalStatus }
                : {}),
              ...(templateDietary.nutriGrade
                ? { nutriGrade: templateDietary.nutriGrade }
                : {}),
              ...(templateDietary.containsPork ? { containsPork: true } : {}),
              ...(templateDietary.containsAlcohol ? { containsAlcohol: true } : {}),
              ...(templateKcal !== null ? { calories: templateKcal } : {}),
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

      <Card data-locked="true">
        <CardBody>
          <div className="v2-detail-head">
            <h2>Product · chain-wide</h2>
            <span className="v2-detail-head-hint">
              Same across every truck. Locked here.
            </span>
          </div>

          <div className="v2-detail-form">
            <Input
              label="Name"
              value={chain.name}
              onChange={() => {}}
              disabled
            />
            <div className="v2-detail-form-row" data-cols="2">
              <Select
                label="Category"
                value={chain.category}
                onChange={() => {}}
                disabled
                options={CATEGORY_ORDER.map((cc) => ({
                  value: cc,
                  label: MENU_CATEGORY_LABELS[cc],
                }))}
              />
              <div className="v2-field">
                <label className="v2-field-label">Tags</label>
                <div className="v2-detail-tags-row v2-detail-tags-row-locked">
                  {MENU_TAGS.map((tag) => {
                    const on = chain.tags.includes(tag);
                    return (
                      <span
                        key={tag}
                        className={`v2-chip ${on ? "is-on" : ""}`}
                        aria-disabled="true"
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <Textarea
              label="Description"
              value={chain.description}
              onChange={() => {}}
              disabled
              rows={3}
            />
          </div>
        </CardBody>
      </Card>

      {present.length > 1 && (
        <div className="v2-scope-bar" role="group" aria-label="Active location for editing below">
          <span className="v2-scope-bar-eyebrow">Editing for</span>
          <select
            value={activeLoc}
            onChange={(e) => setActiveLoc(e.target.value)}
            className="v2-scope-bar-select"
            aria-label="Active location"
          >
            {present.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.city}
              </option>
            ))}
          </select>
          <span className="v2-scope-bar-hint">
            Settings and modifier prices below apply to{" "}
            <strong>{activeCity}</strong> only. Switch the lens to retune
            another truck.
          </span>
        </div>
      )}

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Per-location settings</h2>
          </div>

          <div className="v2-detail-form">
            <div className="v2-detail-form-row" data-cols="2">
              {(() => {
                const activeIsCustom = Boolean(activeVariant?.item._isCustom);
                return (
                  <Input
                    label="Slug"
                    value={slugByLoc[activeLoc] ?? ""}
                    onChange={(e) =>
                      setSlugByLoc((prev) => ({
                        ...prev,
                        [activeLoc]: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      }))
                    }
                    disabled={!activeIsCustom}
                    description={
                      activeIsCustom
                        ? "Custom — 3–60 chars, lowercase, digits, hyphens."
                        : "Seed slug lives in src/data/menus/*.ts."
                    }
                  />
                );
              })()}
              <Input
                label="SKU"
                value={chain.sku}
                onChange={(e) => setChain((c) => ({ ...c, sku: e.target.value }))}
                placeholder="e.g. SI-PIZ-MARG-001"
              />
            </div>
            <div className="v2-detail-form-row" data-cols="2">
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
              <div className="v2-field">
                <label className="v2-field-label">Channel</label>
                <label className="v2-detail-toggle">
                  <input
                    type="checkbox"
                    checked={chain.deliveryOnly}
                    onChange={(e) =>
                      setChain((c) => ({ ...c, deliveryOnly: e.target.checked }))
                    }
                  />
                  <span>Delivery-only item</span>
                </label>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Dietary &amp; disclosures</h2>
            <span className="v2-detail-head-hint">
              {present.length > 1 ? (
                <>
                  Per-location — applies to <strong>{activeCity}</strong>.
                </>
              ) : (
                "Per-location."
              )}{" "}
              Chips only render on the customer card when the truck&apos;s
              zone enables that disclosure (kcal: NYC + EU opt-in; halal +
              Nutri-Grade: SG; pork / alcohol: everywhere).
            </span>
          </div>

          <div className="v2-detail-form">
            <div className="v2-detail-form-row" data-cols="2">
              <Input
                type="number"
                step="1"
                min="0"
                label="Calories"
                value={dietary.caloriesStr}
                onChange={(e) =>
                  setDietary((d) => ({ ...d, caloriesStr: e.target.value }))
                }
                trailingAdornment={<span className="v2-muted">kcal</span>}
                placeholder="—"
                description="Per serving. Surfaces as the kcal pill on the customer menu card."
              />
              <Select
                label="Halal status"
                value={dietary.halalStatus}
                onChange={(e) =>
                  setDietary((d) => ({
                    ...d,
                    halalStatus: e.target.value as DietaryDraft["halalStatus"],
                  }))
                }
                options={[
                  { value: "", label: "— No claim" },
                  { value: "halal", label: "Halal (MUIS-covered)" },
                  { value: "non-halal", label: "Non-halal" },
                  { value: "uncertified", label: "Uncertified" },
                ]}
                description="Renders only on SG trucks."
              />
            </div>
            <div className="v2-detail-form-row" data-cols="2">
              <Select
                label="Nutri-Grade"
                value={dietary.nutriGrade}
                onChange={(e) =>
                  setDietary((d) => ({
                    ...d,
                    nutriGrade: e.target.value as DietaryDraft["nutriGrade"],
                  }))
                }
                options={[
                  { value: "", label: "— Not graded" },
                  { value: "A", label: "A — healthiest" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C" },
                  { value: "D", label: "D — least healthy" },
                ]}
                description="SG NEA Nutri-Grade for sugar-sweetened beverages."
              />
              <div className="v2-field">
                <label className="v2-field-label">Disclaimers</label>
                <label className="v2-detail-toggle">
                  <input
                    type="checkbox"
                    checked={dietary.containsPork}
                    onChange={(e) =>
                      setDietary((d) => ({ ...d, containsPork: e.target.checked }))
                    }
                  />
                  <span>Contains pork</span>
                </label>
                <label className="v2-detail-toggle">
                  <input
                    type="checkbox"
                    checked={dietary.containsAlcohol}
                    onChange={(e) =>
                      setDietary((d) => ({
                        ...d,
                        containsAlcohol: e.target.checked,
                      }))
                    }
                  />
                  <span>Contains alcohol</span>
                </label>
              </div>
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
            selectedLoc={activeLoc}
          />
        </CardBody>
      </Card>
    </div>
  );
}

