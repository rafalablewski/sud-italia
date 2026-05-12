import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  clearMenuOverrides,
  getMenuOverrides,
  setMenuOverridesBulk,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import { menuBulkActionSchema, parseBody } from "@/lib/api-schemas";

/**
 * Bulk-action endpoint for AdminMenu. Two actions multiplexed via `action`:
 *
 *   - `reset`: drop the override rows for the given source ids, reverting
 *     them to the static seed values (price/cost/description/available).
 *   - `clone_to`: copy the override price / cost / description (NOT
 *     availability — that's a location-local decision) from each source
 *     id to the matching item in the target location. Matching is by
 *     case-insensitive name across the seed menu, since item ids are
 *     prefixed per location (`krk-…` vs `waw-…`) but the human-facing
 *     names line up across trucks.
 */
// Bulk reset / clone touches override pricing across the chain — manager+.
// clone_to specifies a target location which is validated against the
// session scope inside the handler.
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, menuBulkActionSchema);
    if ("error" in parsed) return parsed.error;
    const { action, ids, target } = parsed.data;

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
