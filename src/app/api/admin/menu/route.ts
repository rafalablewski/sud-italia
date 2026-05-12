import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  appendAuditLog,
  getMenuOverrides,
  setMenuOverride,
  setMenuOverridesBulk,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { locations } from "@/data/locations";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const locationSlug = req.nextUrl.searchParams.get("location");
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

  // Return all locations' menus
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
}

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

export async function PUT(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    const previousOverrides = await getMenuOverrides();
    const names = buildMenuItemNames();

    const writeAudits = async (updates: Record<string, MenuOverride>) => {
      for (const [id, next] of Object.entries(updates)) {
        const prev = previousOverrides[id];
        // We only emit a dedicated availability audit row when the flag is
        // actually being touched and differs from the prior override. The
        // SANEPID/insurance posture cares about "who 86'd it and when".
        if (typeof next.available === "boolean" && prev?.available !== next.available) {
          await appendAuditLog({
            actor: "admin",
            action: next.available ? "menu.item_available" : "menu.item_86",
            entityType: "menu_item",
            entityId: id,
            before: { available: prev?.available ?? true },
            after: { available: next.available, name: names.get(id) ?? null },
          });
        }
        // Capture any non-availability override change as a generic update so
        // price/description edits are traceable too.
        const otherChanged =
          (next.price !== undefined && next.price !== prev?.price) ||
          (next.cost !== undefined && next.cost !== prev?.cost) ||
          (next.name !== undefined && next.name !== prev?.name) ||
          (next.description !== undefined && next.description !== prev?.description);
        if (otherChanged) {
          await appendAuditLog({
            actor: "admin",
            action: "menu.override_update",
            entityType: "menu_item",
            entityId: id,
            before: prev ?? null,
            after: next,
          });
        }
      }
    };

    // Bulk update: { items: { [id]: override } }
    if (body.items && typeof body.items === "object") {
      const updates = body.items as Record<string, MenuOverride>;
      await setMenuOverridesBulk(updates);
      await writeAudits(updates);
      return NextResponse.json({ success: true });
    }

    // Single update: { id, ...override }
    const { id, ...override } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing item id" }, { status: 400 });
    }

    await setMenuOverride(id, override as MenuOverride);
    await writeAudits({ [id]: override as MenuOverride });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
