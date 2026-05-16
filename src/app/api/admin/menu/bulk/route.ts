import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  clearMenuOverrides,
  deleteCustomMenuItem,
  getCustomMenuItems,
  getMenuOverrides,
  setMenuOverridesBulk,
  updateCustomMenuItem,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import { menuBulkActionSchema, parseBody } from "@/lib/api-schemas";

/**
 * Bulk-action endpoint for AdminMenu. Four actions multiplexed via `action`:
 *
 *   - `reset`: drop the override rows for the given source ids, reverting
 *     them to the static seed values (price/cost/description/available).
 *   - `clone_to`: copy the override price / cost / description (NOT
 *     availability — that's a location-local decision) from each source
 *     id to the matching item in the target location. Matching is by
 *     case-insensitive name across the seed menu, since item ids are
 *     prefixed per location (`krk-…` vs `waw-…`) but the human-facing
 *     names line up across trucks.
 *   - `edit`: apply a sparse `patch` (price / cost / available / category
 *     / tags / description / menuRole / LTO / delivery-only / packaging
 *     cost) to every given id. When `scope="all"`, each id's cross-location
 *     twin gets the same patch — so changing San Pellegrino's cost on 15
 *     trucks is one call, not 15. Seed rows route through the override
 *     pipeline; custom rows are updated in place.
 *   - `delete`: remove the given items. Custom items hard-delete; seed
 *     items get a `hidden: true` override (restorable). When `scope="all"`,
 *     each id's cross-location twin (matched by case-insensitive name) is
 *     also removed — operators no longer have to delete the same item
 *     from each truck manually.
 */
// Bulk reset / clone touches override pricing across the chain — manager+.
// clone_to specifies a target location which is validated against the
// session scope inside the handler.
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, menuBulkActionSchema);
    if ("error" in parsed) return parsed.error;
    const { action, ids, target, scope, patch } = parsed.data;

    if (action === "edit") {
      // Same custom-vs-seed + scope expansion as `delete`. For each
      // resolved row, apply `patch` via the right primitive: seed rows
      // get the patch merged into their MenuOverride; custom rows are
      // updated in-place on the canonical row.
      const editPatch = patch ?? {};
      const activeLocs = getActiveLocations();
      const customAll = await getCustomMenuItems();
      const customById = new Map(customAll.map((c) => [c.id, c]));
      const seedByLoc = new Map<string, ReturnType<typeof getMenu>>();
      for (const l of activeLocs) seedByLoc.set(l.slug, getMenu(l.slug));

      type TargetRow = {
        id: string;
        kind: "custom" | "seed";
        locationSlug: string;
        name: string;
      };
      const targets = new Map<string, TargetRow>();
      const unresolved: string[] = [];

      const resolveRow = (id: string): TargetRow | null => {
        const c = customById.get(id);
        if (c) return { id: c.id, kind: "custom", locationSlug: c.locationSlug, name: c.name };
        for (const [slug, items] of seedByLoc) {
          const hit = items.find((i) => i.id === id);
          if (hit) return { id, kind: "seed", locationSlug: slug, name: hit.name };
        }
        return null;
      };

      const findTwins = (row: TargetRow): TargetRow[] => {
        const key = row.name.trim().toLowerCase();
        const twins: TargetRow[] = [];
        for (const l of activeLocs) {
          if (l.slug === row.locationSlug) continue;
          const c = customAll.find(
            (cc) => cc.locationSlug === l.slug && cc.name.trim().toLowerCase() === key,
          );
          if (c) {
            twins.push({ id: c.id, kind: "custom", locationSlug: l.slug, name: c.name });
            continue;
          }
          const seedHit = (seedByLoc.get(l.slug) ?? []).find(
            (i) => i.name.trim().toLowerCase() === key,
          );
          if (seedHit) {
            twins.push({ id: seedHit.id, kind: "seed", locationSlug: l.slug, name: seedHit.name });
          }
        }
        return twins;
      };

      for (const id of ids) {
        const row = resolveRow(id);
        if (!row) {
          unresolved.push(id);
          continue;
        }
        targets.set(row.id, row);
        if (scope === "all") {
          for (const twin of findTwins(row)) targets.set(twin.id, twin);
        }
      }

      // Authorize every touched location upfront.
      const touched = new Set<string>();
      for (const r of targets.values()) touched.add(r.locationSlug);
      for (const slug of touched) {
        if (!(await hasLocationAccess(slug))) {
          return NextResponse.json(
            { error: `Session is not authorized for location "${slug}"` },
            { status: 403 },
          );
        }
      }

      // Build the seed-overrides write in one shot for atomicity. Custom
      // updates are sequential because each row mutates its own JSON record.
      const seedUpdates: Record<string, MenuOverride> = {};
      const customRows: TargetRow[] = [];
      for (const row of targets.values()) {
        if (row.kind === "seed") seedUpdates[row.id] = editPatch as MenuOverride;
        else customRows.push(row);
      }
      if (Object.keys(seedUpdates).length > 0) {
        await setMenuOverridesBulk(seedUpdates);
      }
      // Custom items have no "clear back to seed" notion — translate any
      // explicit null into undefined so updateCustomMenuItem doesn't
      // persist `null` as a stored value (CustomMenuItem fields are
      // string/number/boolean, not nullable).
      const customPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editPatch)) {
        customPatch[k] = v === null ? undefined : v;
      }
      let customUpdated = 0;
      const customFailed: string[] = [];
      for (const row of customRows) {
        try {
          const updated = await updateCustomMenuItem(row.id, customPatch);
          if (updated) customUpdated++;
          else customFailed.push(row.id);
        } catch {
          customFailed.push(row.id);
        }
      }

      await appendAuditLog({
        actor: user.email || user.id,
        action: "menu.bulk_edit",
        entityType: "menu_item",
        entityId: `batch-of-${targets.size}`,
        after: {
          scope: scope ?? "current",
          patch: editPatch,
          requestedIds: ids,
          unresolvedIds: unresolved,
          seedOverridden: Object.keys(seedUpdates).length,
          customUpdated,
          customFailed,
          locations: [...touched],
        },
      });

      return NextResponse.json({
        ok: true,
        action: "edit",
        scope: scope ?? "current",
        seedOverridden: Object.keys(seedUpdates).length,
        customUpdated,
        affected: Object.keys(seedUpdates).length + customUpdated,
        unresolvedIds: unresolved,
        customFailedIds: customFailed,
        locations: [...touched],
      });
    }

    if (action === "delete") {
      // Resolve every id to its row (custom vs seed) plus, when scope="all",
      // its cross-location twins by case-insensitive name match. Custom rows
      // hard-delete; seed rows get a `hidden: true` override so they can be
      // restored via the AdminMenu "Show hidden" toggle.
      const activeLocs = getActiveLocations();
      const validLocSlugs = new Set(activeLocs.map((l) => l.slug));
      const customAll = await getCustomMenuItems();
      const customById = new Map(customAll.map((c) => [c.id, c]));
      const seedByLoc = new Map<string, ReturnType<typeof getMenu>>();
      for (const l of activeLocs) seedByLoc.set(l.slug, getMenu(l.slug));

      // For each input id, expand to the set of ids we must delete/hide.
      // Track per-id origin (custom vs seed) for the right teardown action.
      type TargetRow = {
        id: string;
        kind: "custom" | "seed";
        locationSlug: string;
        name: string;
      };
      const targetsById = new Map<string, TargetRow>();

      const resolveRow = (id: string): TargetRow | null => {
        const custom = customById.get(id);
        if (custom) {
          return { id: custom.id, kind: "custom", locationSlug: custom.locationSlug, name: custom.name };
        }
        for (const [slug, items] of seedByLoc) {
          const hit = items.find((i) => i.id === id);
          if (hit) return { id, kind: "seed", locationSlug: slug, name: hit.name };
        }
        return null;
      };

      const findTwins = (row: TargetRow): TargetRow[] => {
        const key = row.name.trim().toLowerCase();
        const twins: TargetRow[] = [];
        for (const slug of validLocSlugs) {
          if (slug === row.locationSlug) continue;
          const custom = customAll.find(
            (c) => c.locationSlug === slug && c.name.trim().toLowerCase() === key,
          );
          if (custom) {
            twins.push({ id: custom.id, kind: "custom", locationSlug: slug, name: custom.name });
            continue;
          }
          const seedItems = seedByLoc.get(slug) ?? [];
          const seedHit = seedItems.find((i) => i.name.trim().toLowerCase() === key);
          if (seedHit) {
            twins.push({ id: seedHit.id, kind: "seed", locationSlug: slug, name: seedHit.name });
          }
        }
        return twins;
      };

      const unresolved: string[] = [];
      for (const id of ids) {
        const row = resolveRow(id);
        if (!row) {
          unresolved.push(id);
          continue;
        }
        targetsById.set(row.id, row);
        if (scope === "all") {
          for (const twin of findTwins(row)) targetsById.set(twin.id, twin);
        }
      }

      // Authorize every location we're about to touch — partial failure is
      // worse than a 403, so we reject the whole batch if any location is
      // out of scope.
      const touchedLocations = new Set<string>();
      for (const row of targetsById.values()) touchedLocations.add(row.locationSlug);
      for (const slug of touchedLocations) {
        if (!(await hasLocationAccess(slug))) {
          return NextResponse.json(
            { error: `Session is not authorized for location "${slug}"` },
            { status: 403 },
          );
        }
      }

      // Apply: custom → DELETE; seed → setMenuOverridesBulk({hidden:true}).
      const customTargets = [...targetsById.values()].filter((r) => r.kind === "custom");
      const seedTargets = [...targetsById.values()].filter((r) => r.kind === "seed");
      let customDeleted = 0;
      const customFailed: string[] = [];
      for (const row of customTargets) {
        const ok = await deleteCustomMenuItem(row.id);
        if (ok) customDeleted++;
        else customFailed.push(row.id);
      }
      if (seedTargets.length > 0) {
        const seedUpdates: Record<string, MenuOverride> = {};
        for (const row of seedTargets) seedUpdates[row.id] = { hidden: true };
        await setMenuOverridesBulk(seedUpdates);
      }

      await appendAuditLog({
        actor: user.email || user.id,
        action: "menu.bulk_delete",
        entityType: "menu_item",
        entityId: `batch-of-${targetsById.size}`,
        after: {
          scope: scope ?? "current",
          requestedIds: ids,
          unresolvedIds: unresolved,
          customDeleted,
          customFailed,
          seedHidden: seedTargets.length,
          locations: [...touchedLocations],
          rows: [...targetsById.values()].map((r) => ({ id: r.id, kind: r.kind, locationSlug: r.locationSlug })),
        },
      });

      return NextResponse.json({
        ok: true,
        action: "delete",
        scope: scope ?? "current",
        customDeleted,
        seedHidden: seedTargets.length,
        affected: customDeleted + seedTargets.length,
        unresolvedIds: unresolved,
        customFailedIds: customFailed,
      });
    }

    if (action === "reset") {
      const removed = await clearMenuOverrides(ids);
      await appendAuditLog({
        actor: user.email || user.id,
        action: "menu.bulk_reset_overrides",
        entityType: "menu_item",
        entityId: `batch-of-${removed}`,
        after: { ids, removed },
      });
      return NextResponse.json({ ok: true, action: "reset", affected: removed });
    }

    // action === "clone_to" — schema's refine guarantees `target` is set.
    const targetSlug = target as string;
    const validLocations = getActiveLocations().map((l) => l.slug);
    if (!validLocations.includes(targetSlug)) {
      return NextResponse.json({ error: "Unknown target location" }, { status: 400 });
    }
    if (!(await hasLocationAccess(targetSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${targetSlug}"` },
        { status: 403 },
      );
    }

    // Resolve source items + overrides. We pull the source from the full
    // seed (any active location) because the bulk action might span items
    // from different locations if the caller mixes ids.
    const overrides = await getMenuOverrides();
    const allByLocation = validLocations.map((slug) => ({ slug, items: getMenu(slug) }));
    const allItems = allByLocation.flatMap((l) => l.items);
    const targetItems = getMenu(targetSlug);

    // Build a name→targetItem map (lowercased) so cross-location matching
    // is case-insensitive and handles trivial whitespace differences.
    const targetByName = new Map<string, (typeof targetItems)[number]>();
    for (const item of targetItems) targetByName.set(item.name.trim().toLowerCase(), item);

    const updates: Record<string, MenuOverride> = {};
    const matched: { sourceId: string; targetId: string; name: string }[] = [];
    const unmatched: string[] = [];
    for (const id of ids) {
      const source = allItems.find((m) => m.id === id);
      if (!source) {
        unmatched.push(id);
        continue;
      }
      // Skip when the source IS in the target location — cloning Margherita
      // from Kraków onto Kraków's Margherita would be a no-op.
      const target = targetByName.get(source.name.trim().toLowerCase());
      if (!target || target.id === id) {
        unmatched.push(id);
        continue;
      }
      // Effective values come from override-merged source so the user
      // gets what they SEE in the menu (custom price, etc), not the raw
      // seed values.
      const sourceOverride = overrides[id] ?? {};
      const merged: MenuOverride = {};
      if (sourceOverride.price !== undefined) merged.price = sourceOverride.price;
      else if (source.price !== target.price) merged.price = source.price;
      if (sourceOverride.cost !== undefined) merged.cost = sourceOverride.cost;
      else if (source.cost !== target.cost) merged.cost = source.cost;
      if (sourceOverride.description !== undefined) merged.description = sourceOverride.description;
      else if (source.description !== target.description) merged.description = source.description;
      // Audit §4.3 menu engineering — clone the role + LTO so a hero in
      // Kraków stays a hero in Warszawa. seed-vs-seed mismatches also
      // propagate so the target picks up any code-defined role parity.
      if (sourceOverride.menuRole !== undefined) merged.menuRole = sourceOverride.menuRole;
      else if (source.menuRole !== target.menuRole)
        merged.menuRole = (source.menuRole ?? null) as MenuOverride["menuRole"];
      if (sourceOverride.isLimited !== undefined) merged.isLimited = sourceOverride.isLimited;
      else if (Boolean(source.isLimited) !== Boolean(target.isLimited))
        merged.isLimited = source.isLimited ?? null;
      if (sourceOverride.limitedUntil !== undefined) merged.limitedUntil = sourceOverride.limitedUntil;
      else if ((source.limitedUntil ?? null) !== (target.limitedUntil ?? null))
        merged.limitedUntil = source.limitedUntil ?? null;
      // Skip if there's literally nothing to copy.
      if (Object.keys(merged).length === 0) {
        unmatched.push(id);
        continue;
      }
      updates[target.id] = merged;
      matched.push({ sourceId: id, targetId: target.id, name: source.name });
    }

    if (Object.keys(updates).length > 0) {
      await setMenuOverridesBulk(updates);
    }
    await appendAuditLog({
      actor: user.email || user.id,
      action: "menu.bulk_clone_overrides",
      entityType: "menu_item",
      entityId: `to-${targetSlug}-batch-of-${matched.length}`,
      after: { targetSlug, matched, unmatched },
    });
    return NextResponse.json({
      ok: true,
      action: "clone_to",
      target: targetSlug,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatchedIds: unmatched,
    });
  },
);
