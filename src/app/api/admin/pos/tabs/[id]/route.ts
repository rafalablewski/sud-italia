import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { deletePosTab, getPosTab, savePosTab } from "@/lib/store";
import type { FulfillmentType, PosTabLine, PosTabStatus } from "@/data/types";

/**
 * A single POS open check. PATCH updates the working order (items, channel,
 * table/covers, delivery address, park/resume, rename). DELETE discards it
 * without charging. Lines never carry a price — only menuItemId + quantity,
 * re-priced server-side. Staff+, location-scoped; a tab can only be touched
 * from its own truck.
 */

const CHANNELS: FulfillmentType[] = ["takeout", "delivery", "dine-in"];
const STATUSES: PosTabStatus[] = ["open", "parked", "pay"];

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["staff"], locationParam: "location" },
  async (req, { params }, { locationSlug }) => {
    const { id } = await params;
    const existing = await getPosTab(id);
    if (!existing) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    if (locationSlug && existing.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab belongs to another location" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 40)
        : existing.name;

    const channel: FulfillmentType | null =
      body.channel === null
        ? null
        : CHANNELS.includes(body.channel)
          ? body.channel
          : existing.channel;

    const status: PosTabStatus = STATUSES.includes(body.status) ? body.status : existing.status;

    const items: PosTabLine[] = Array.isArray(body.items)
      ? body.items
          .map((l: { menuItemId?: unknown; quantity?: unknown }) => ({
            menuItemId: String(l.menuItemId ?? ""),
            quantity: Math.max(1, Math.min(99, Math.round(Number(l.quantity) || 0))),
          }))
          .filter((l: PosTabLine) => l.menuItemId && l.quantity >= 1)
      : existing.items;

    const tableId =
      "tableId" in body ? (body.tableId ? String(body.tableId) : undefined) : existing.tableId;
    const covers =
      "covers" in body
        ? body.covers != null
          ? Math.max(1, Math.min(50, Math.round(Number(body.covers) || 2)))
          : undefined
        : existing.covers;
    const address =
      "address" in body
        ? body.address
          ? String(body.address).trim().slice(0, 500)
          : undefined
        : existing.address;

    // Editing the contents invalidates a prior KDS fire — the operator must
    // re-send so the kitchen sees the change (mirrors the mockup behaviour).
    const itemsChanged =
      Array.isArray(body.items) &&
      JSON.stringify(items) !== JSON.stringify(existing.items);
    const sentKds = itemsChanged ? false : existing.sentKds;

    const tab = await savePosTab({
      id: existing.id,
      locationSlug: existing.locationSlug,
      name,
      channel,
      status,
      items,
      tableId: channel === "dine-in" ? tableId : undefined,
      covers: channel === "dine-in" ? (covers ?? 2) : undefined,
      address: channel === "delivery" ? address : undefined,
      sentKds,
      orderId: existing.orderId,
    });
    return NextResponse.json({ tab });
  },
);

export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["staff"], locationParam: "location" },
  async (_req, { params }, { locationSlug }) => {
    const { id } = await params;
    const existing = await getPosTab(id);
    if (!existing) return NextResponse.json({ ok: true });
    if (locationSlug && existing.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab belongs to another location" }, { status: 403 });
    }
    const ok = await deletePosTab(id);
    return NextResponse.json({ ok });
  },
);
