import { NextResponse } from "next/server";
import { z } from "zod";
import { getTables, getPosTabs, savePosTab } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";

/**
 * Guest QR order → the SAME check (the "fourth renderer"). A guest at a table
 * appends items to that table's open POS tab as **pending** lines
 * (`guestPending`) — not a parallel standalone order — so the server reviews &
 * fires them on the one check. Public (no admin auth), like /api/checkout, but
 * it can ONLY append available menu items to a dine-in tab for a real table;
 * it never fires, charges, or removes anything.
 *
 * POST { locationSlug, tableNumber, items:[{menuItemId, quantity, notes?}], customerName? }
 */
const Schema = z.object({
  locationSlug: z.string().min(1).max(64),
  tableNumber: z.union([z.string(), z.number()]),
  customerName: z.string().max(80).optional(),
  items: z
    .array(z.object({ menuItemId: z.string().min(1).max(120), quantity: z.number().int().min(1).max(20), notes: z.string().max(120).optional() }))
    .min(1)
    .max(30),
});

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { locationSlug, tableNumber, customerName, items } = parsed.data;

  const table = (await getTables(locationSlug)).find((t) => String(t.number) === String(tableNumber));
  if (!table) return NextResponse.json({ error: "table not found" }, { status: 404 });

  // Only real, available menu items — the guest never sends a price.
  const okIds = new Set((await getMenuWithOverrides(locationSlug)).filter((m) => m.available).map((m) => m.id));
  const lines = items
    .filter((i) => okIds.has(i.menuItemId))
    .map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes, guestPending: true }));
  if (lines.length === 0) return NextResponse.json({ error: "no available items" }, { status: 400 });

  // Append to the table's open tab, or open one bound to the table.
  const open = (await getPosTabs(locationSlug)).find((t) => t.tableId === table.id && t.status === "open");
  const tab = await savePosTab({
    id: open?.id,
    locationSlug,
    name: open?.name ?? `Table ${table.number}`,
    channel: open?.channel ?? "dine-in",
    status: "open",
    tableId: table.id,
    ...(open?.covers ? { covers: open.covers } : {}),
    customerName: open?.customerName ?? customerName,
    items: [...(open?.items ?? []), ...lines],
  });
  return NextResponse.json({ ok: true, tableNumber: table.number, tabId: tab.id, added: lines.length });
}
