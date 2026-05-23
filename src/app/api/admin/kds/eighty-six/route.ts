import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getMenuOverrides, setMenuOverride } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { parseBody } from "@/lib/api-schemas";
import { z } from "zod";

/**
 * Kitchen-permitted 86 toggle. Running out of an item mid-service is the #1
 * reason a line cook touches the menu, so this is open to kitchen+ (not just
 * manager like the full menu editor) — but it can ONLY flip availability, and
 * every flip is audit-logged with the actor so there's accountability.
 *
 * GET ?location= → the location's currently-86'd items (id + name) so the
 * chef strip can show restore chips. POST { id, available } toggles one item.
 */
const bodySchema = z.object({
  id: z.string().min(1).max(120),
  available: z.boolean(),
});

async function resolveSlug(locationSlug: string | null): Promise<string | undefined> {
  return locationSlug ?? (await getActiveLocationsAsync())[0]?.slug;
}

export const GET = withAdmin(
  { roles: ["kitchen"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const slug = await resolveSlug(locationSlug);
    if (!slug) return NextResponse.json({ eightySixed: [] });
    const eightySixed = (await getMenuWithOverrides(slug))
      .filter((m) => m.available === false)
      .map((m) => ({ id: m.id, name: m.name }));
    return NextResponse.json({ locationSlug: slug, eightySixed });
  },
);

export const POST = withAdmin(
  { roles: ["kitchen"], locationParam: "location" },
  async (req, _ctx, { locationSlug, user }) => {
    const parsed = await parseBody(req, bodySchema);
    if ("error" in parsed) return parsed.error;
    const { id, available } = parsed.data;

    const slug = await resolveSlug(locationSlug);
    const name = slug
      ? (await getMenuWithOverrides(slug)).find((m) => m.id === id)?.name ?? null
      : null;
    const prev = (await getMenuOverrides())[id];

    await setMenuOverride(id, { available });
    if (prev?.available !== available) {
      await appendAuditLog({
        actor: user.email || user.id,
        action: available ? "menu.item_available" : "menu.item_86",
        entityType: "menu_item",
        entityId: id,
        before: { available: prev?.available ?? true },
        after: { available, name },
      });
    }
    return NextResponse.json({ ok: true });
  },
);
