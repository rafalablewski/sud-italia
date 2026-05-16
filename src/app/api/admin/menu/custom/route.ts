import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  addCustomMenuItem,
  appendAuditLog,
  deleteCustomMenuItem,
  getCustomMenuItems,
  renameCustomMenuItem,
  updateCustomMenuItem,
  type CustomMenuItem,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { locations } from "@/data/locations";
import {
  customMenuItemCreateSchema,
  customMenuItemUpdateSchema,
  parseBody,
} from "@/lib/api-schemas";

/**
 * Custom menu items — admin-created SKUs that live alongside the static
 * seed catalogue. POST creates, PATCH edits, DELETE removes. GET returns
 * the rows for a location (handy for ops tooling; the AdminMenu UI uses
 * the consolidated /api/admin/menu endpoint).
 *
 * IDs must not collide with the seed catalogue or each other so the
 * merge in getMenuWithOverrides() stays deterministic.
 */

function seedHasId(id: string): boolean {
  // Walk every configured location (active or not) so a future relaunch
  // can't resurrect a previously-shipped id under a new "custom" guise,
  // and a new truck added to /data/locations.ts doesn't slip past the
  // collision check.
  for (const loc of locations) {
    if (getMenu(loc.slug).some((i) => i.id === id)) return true;
  }
  return false;
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, customMenuItemCreateSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }

    if (seedHasId(body.id)) {
      return NextResponse.json(
        { error: `Item id "${body.id}" clashes with the seed catalogue` },
        { status: 409 },
      );
    }
    const existing = await getCustomMenuItems();
    if (existing.some((i) => i.id === body.id)) {
      return NextResponse.json(
        { error: `Item id "${body.id}" already exists` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const item: CustomMenuItem = {
      id: body.id,
      locationSlug: body.locationSlug,
      name: body.name,
      description: body.description,
      price: body.price,
      cost: body.cost,
      category: body.category,
      tags: body.tags,
      available: body.available,
      ...(body.deliveryOnly !== undefined ? { deliveryOnly: body.deliveryOnly } : {}),
      ...(body.packagingCost !== undefined ? { packagingCost: body.packagingCost } : {}),
      ...(body.modifierGroups !== undefined ? { modifierGroups: body.modifierGroups } : {}),
      ...(body.sku !== undefined ? { sku: body.sku } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await addCustomMenuItem(item);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "menu.custom_create",
      entityType: "menu_item",
      entityId: item.id,
      after: item,
    });
    return NextResponse.json({ ok: true, item });
  },
);

export const PATCH = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing `id` query parameter" }, { status: 400 });
    }
    const parsed = await parseBody(req, customMenuItemUpdateSchema);
    if ("error" in parsed) return parsed.error;
    const { newId, ...patch } = parsed.data;

    const all = await getCustomMenuItems();
    const prev = all.find((i) => i.id === id);
    if (!prev) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (!(await hasLocationAccess(prev.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${prev.locationSlug}"` },
        { status: 403 },
      );
    }

    // Handle rename first so subsequent patch writes target the new id.
    let effectiveId = id;
    if (newId && newId !== id) {
      if (seedHasId(newId)) {
        return NextResponse.json(
          { error: `Item id "${newId}" clashes with the seed catalogue` },
          { status: 409 },
        );
      }
      try {
        const renamed = await renameCustomMenuItem(id, newId);
        if (!renamed) {
          return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }
        effectiveId = newId;
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Rename failed" },
          { status: 409 },
        );
      }
    }

    const next = await updateCustomMenuItem(effectiveId, patch);
    if (!next) {
      // Lost-update race: another tab deleted the row between the
      // existence check and the write. Surface as a 404 so the UI
      // refetches instead of silently swallowing the patch.
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    await appendAuditLog({
      actor: user.email || user.id,
      action: newId && newId !== id ? "menu.custom_rename" : "menu.custom_update",
      entityType: "menu_item",
      entityId: effectiveId,
      before: prev,
      after: next,
    });
    return NextResponse.json({ ok: true, item: next });
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing `id` query parameter" }, { status: 400 });
    }
    const all = await getCustomMenuItems();
    const prev = all.find((i) => i.id === id);
    if (!prev) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (!(await hasLocationAccess(prev.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${prev.locationSlug}"` },
        { status: 403 },
      );
    }
    const removed = await deleteCustomMenuItem(id);
    if (!removed) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    await appendAuditLog({
      actor: user.email || user.id,
      action: "menu.custom_delete",
      entityType: "menu_item",
      entityId: id,
      before: prev,
    });
    return NextResponse.json({ ok: true });
  },
);
