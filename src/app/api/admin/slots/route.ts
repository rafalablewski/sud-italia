import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSlots, createSlot, updateSlot, deleteSlot } from "@/lib/store";
import { FulfillmentType } from "@/data/types";

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

  return NextResponse.json(getSlots(locationSlug, date));
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    const { locationSlug, date, time, maxOrders, fulfillmentTypes } = body;

    if (!locationSlug || !date || !time || !maxOrders || !fulfillmentTypes?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const slot = createSlot({
      id,
      locationSlug,
      date,
      time,
      maxOrders: Number(maxOrders),
      currentOrders: 0,
      fulfillmentTypes: fulfillmentTypes as FulfillmentType[],
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

    const slot = updateSlot(id, updates);
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

  const deleted = deleteSlot(id);
  if (!deleted) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
