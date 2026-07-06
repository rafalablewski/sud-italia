import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { getSlots, createSlot, createSlotsBulk, updateSlot, updateSlotsBulk, deleteSlot, deleteSlotsBulk, getOrders, getSlotById, ensureDineInSlots } from "@/lib/store";
import { parseBody, slotCreateSchema, slotUpdateSchema } from "@/lib/api-schemas";
import type { SlotStatus, Order } from "@/data/types";

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug: scoped }) => {
    const locationSlug = scoped ?? undefined;
    const date = req.nextUrl.searchParams.get("date") || undefined;
    const includeOrders = req.nextUrl.searchParams.get("includeOrders") === "true";
    // Materialise the default dine-in seating grid (a slot every 30 min for the
    // whole floor) before reading, so Book/Slots always show a full day of
    // reservable windows without anyone hand-building them. Idempotent; needs a
    // concrete location + date.
    const ensureDineIn = req.nextUrl.searchParams.get("ensureDineIn") === "1";
    if (ensureDineIn && locationSlug && date) {
      await ensureDineInSlots(locationSlug, date);
    }

    const slots = await getSlots(locationSlug, date);

    if (!includeOrders) {
      return NextResponse.json(slots);
    }

    const orders = await getOrders(locationSlug);
    const ordersBySlot = new Map<string, Order[]>();
    for (const order of orders) {
      if (!ordersBySlot.has(order.slotId)) ordersBySlot.set(order.slotId, []);
      ordersBySlot.get(order.slotId)!.push(order);
    }

    const slotsWithOrders = slots.map((s) => ({
      ...s,
      orders: (ordersBySlot.get(s.id) || []).map((o) => ({
        id: o.id,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        totalAmount: o.totalAmount,
        fulfillmentType: o.fulfillmentType,
        status: o.status,
        itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
        createdAt: o.createdAt,
      })),
    }));

    return NextResponse.json(slotsWithOrders);
  },
);

// Slot creation = scheduling capacity = manager+ only. Body-derived location
// check ensures a manager scoped to Kraków cannot create Warszawa slots.
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const parsed = await parseBody(req, slotCreateSchema);
    if ("error" in parsed) return parsed.error;
    const { locationSlug, date, time, maxOrders, fulfillmentTypes, bulk, status } = parsed.data;
    // Honour an explicit status from the caller (v2 creates slots "active");
    // default to draft so legacy callers keep the staged-then-publish flow.
    const slotStatus: SlotStatus = status ?? "draft";

    if (!(await hasLocationAccess(locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${locationSlug}"` },
        { status: 403 },
      );
    }

    if (bulk) {
      // Schema's refine guarantees maxOrders is present when bulk is used.
      const max = maxOrders as number;
      const startParts = bulk.startTime.split(":").map(Number);
      const endParts = bulk.endTime.split(":").map(Number);
      let startMin = startParts[0] * 60 + startParts[1];
      const endMin = endParts[0] * 60 + endParts[1];
      const newSlots = [];

      while (startMin <= endMin) {
        const h = Math.floor(startMin / 60).toString().padStart(2, "0");
        const m = (startMin % 60).toString().padStart(2, "0");
        newSlots.push({
          id: `slot-${crypto.randomUUID()}`,
          locationSlug,
          date,
          time: `${h}:${m}`,
          maxOrders: max,
          currentOrders: 0,
          fulfillmentTypes,
          status: slotStatus,
        });
        startMin += bulk.interval;
      }

      const created = await createSlotsBulk(newSlots);
      return NextResponse.json(created, { status: 201 });
    }

    // Schema's refine guarantees time + maxOrders are present when bulk is absent.
    const id = `slot-${crypto.randomUUID()}`;
    const slot = await createSlot({
      id,
      locationSlug,
      date,
      time: time as string,
      maxOrders: maxOrders as number,
      currentOrders: 0,
      fulfillmentTypes,
      status: slotStatus,
    });

    return NextResponse.json(slot, { status: 201 });
  },
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const parsed = await parseBody(req, slotUpdateSchema);
    if ("error" in parsed) return parsed.error;
    const { id, ids, ...updates } = parsed.data;

    // Bulk update — per-slot location check would require N reads; the
    // role gate to manager+ is the floor here. Phase 1 normalization will
    // make this an atomic UPDATE with a WHERE location_slug = ANY(scope).
    if (ids && ids.length > 0) {
      const results = await updateSlotsBulk(ids, updates);
      return NextResponse.json(results);
    }

    // Schema's refine guarantees `id` is present when `ids` is absent.
    const singleId = id as string;
    const existing = await getSlotById(singleId);
    if (!existing) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }
    if (!(await hasLocationAccess(existing.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${existing.locationSlug}"` },
        { status: 403 },
      );
    }

    const slot = await updateSlot(singleId, updates);
    if (!slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    return NextResponse.json(slot);
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    const idsParam = req.nextUrl.searchParams.get("ids");

    // Bulk delete — see PUT note. Phase 1 will atomic-filter via WHERE.
    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      const count = await deleteSlotsBulk(ids);
      return NextResponse.json({ success: true, deleted: count });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing slot id" }, { status: 400 });
    }

    const existing = await getSlotById(id);
    if (!existing) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }
    if (!(await hasLocationAccess(existing.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${existing.locationSlug}"` },
        { status: 403 },
      );
    }

    const deleted = await deleteSlot(id);
    if (!deleted) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  },
);
