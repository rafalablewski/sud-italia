import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getMenuOverrides,
  setMenuOverride,
  setMenuOverridesBulk,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { locations } from "@/data/locations";
import { menuOverridePutSchema, parseBody } from "@/lib/api-schemas";

// Menu reads are scoped per-location when a slug is provided. When omitted
// (returning all locations' menus), the session must hold unrestricted scope
// — withAdmin's "missing locationParam = require *" semantics enforces that.
export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const overrides = await getMenuOverrides();

    if (locationSlug) {
      const base = getMenu(locationSlug);
      const merged = base.map((item) => ({
        ...item,
        ...overrides[item.id],
        _hasOverride: !!overrides[item.id],
      }));
      return NextResponse.json(merged);
    }

    const active = locations.filter((l) => l.isActive);
    const result: Record<string, unknown[]> = {};
    for (const loc of active) {
      const base = getMenu(loc.slug);
      result[loc.slug] = base.map((item) => ({
        ...item,
        ...overrides[item.id],
        _hasOverride: !!overrides[item.id],
      }));
    }
    return NextResponse.json(result);
  },
);

/** Menu-name lookup across every active location so audit entries include
 * the human-readable item name without forcing the caller to send it.
 * Menu data is static (seed code), so the result never changes within a
 * single Node process — cached at module scope to keep PUT requests fast
 * as the chain scales out to more trucks / SKUs. */
let cachedMenuItemNames: Map<string, string> | null = null;
function buildMenuItemNames(): Map<string, string> {
  if (cachedMenuItemNames) return cachedMenuItemNames;
  const lookup = new Map<string, string>();
  for (const loc of locations) {
    if (!loc.isActive) continue;
    for (const item of getMenu(loc.slug)) lookup.set(item.id, item.name);
  }
  cachedMenuItemNames = lookup;
  return lookup;
}

// Menu overrides (price, availability, 86'ing) touch revenue + customer
// experience — manager+ only. The override map is keyed by item id and is
// effectively global across locations; cross-location tightening waits for
// Phase 1 normalized menu_items.
export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, menuOverridePutSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    const previousOverrides = await getMenuOverrides();
    const names = buildMenuItemNames();

    const writeAudits = async (updates: Record<string, MenuOverride>) => {
        for (const [id, next] of Object.entries(updates)) {
          const prev = previousOverrides[id];
          if (typeof next.available === "boolean" && prev?.available !== next.available) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: next.available ? "menu.item_available" : "menu.item_86",
              entityType: "menu_item",
              entityId: id,
              before: { available: prev?.available ?? true },
              after: { available: next.available, name: names.get(id) ?? null },
            });
          }
          const otherChanged =
            (next.price !== undefined && next.price !== prev?.price) ||
            (next.cost !== undefined && next.cost !== prev?.cost) ||
            (next.name !== undefined && next.name !== prev?.name) ||
            (next.description !== undefined && next.description !== prev?.description);
          if (otherChanged) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: "menu.override_update",
              entityType: "menu_item",
              entityId: id,
              before: prev ?? null,
              after: next,
            });
          }
        }
      };

    if (body.items) {
      const updates = body.items as Record<string, MenuOverride>;
      await setMenuOverridesBulk(updates);
      await writeAudits(updates);
      return NextResponse.json({ success: true });
    }

    // Schema's refine guarantees `id` is present when `items` is absent.
    const { id, items: _items, ...override } = body;
    const singleId = id as string;
    await setMenuOverride(singleId, override as MenuOverride);
    await writeAudits({ [singleId]: override as MenuOverride });
    return NextResponse.json({ success: true });
  },
);
