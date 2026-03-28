import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSlots, createSlot, createSlotsBulk, updateSlot, deleteSlot } from "@/lib/store";
import { FulfillmentType } from "@/data/types";

const VALID_FULFILLMENT_TYPES = new Set<string>(["takeout", "delivery"]);

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const locationSlug = req.nextUrl.searchParams.get("location") || undefined;
  const date = req.nextUrl.searchParams.get("date") || undefined;

  return NextResponse.json(await getSlots(locationSlug, date));
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    const { locationSlug, date, time, maxOrders, fulfillmentTypes, bulk } = body;

    if (!locationSlug || !date || !fulfillmentTypes?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate fulfillment types
    const validTypes = (fulfillmentTypes as string[]).filter((t) => VALID_FULFILLMENT_TYPES.has(t)) as FulfillmentType[];
    if (validTypes.length === 0) {
      return NextResponse.json({ error: "Invalid fulfillment types" }, { status: 400 });
    }

    // Bulk creation mode
    if (bulk) {
      const { startTime, endTime, interval } = bulk;
      if (!startTime || !endTime || !interval || !maxOrders) {
        return NextResponse.json({ error: "Missing bulk fields" }, { status: 400 });
      }

      const startParts = startTime.split(":").map(Number);
      const endParts = endTime.split(":").map(Number);
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
          maxOrders: Number(maxOrders),
          currentOrders: 0,
          fulfillmentTypes: validTypes,
        });
        startMin += Number(interval);
      }

      const created = await createSlotsBulk(newSlots);
      return NextResponse.json(created, { status: 201 });
    }

    // Single slot creation
    if (!time || !maxOrders) {
      return NextResponse.json({ error: "Missing time or maxOrders" }, { status: 400 });
    }

    const id = `slot-${crypto.randomUUID()}`;
    const slot = await createSlot({
      id,
      locationSlug,
      date,
      time,
      maxOrders: Number(maxOrders),
      currentOrders: 0,
      fulfillmentTypes: validTypes,
    });

    return NextResponse.json(slot, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing slot id" }, { status: 400 });
    }

    const slot = await updateSlot(id, updates);
    if (!slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    return NextResponse.json(slot);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing slot id" }, { status: 400 });
  }

  const deleted = await deleteSlot(id);
  if (!deleted) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
