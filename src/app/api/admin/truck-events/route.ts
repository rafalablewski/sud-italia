import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteTruckEvent, getTruckEvents, saveTruckEvent } from "@/lib/store";
import type { TruckEventStatus } from "@/data/types";

const VALID_STATUS: TruckEventStatus[] = ["scheduled", "live", "done", "cancelled"];

async function requireAuth() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  return NextResponse.json(await getTruckEvents({ locationSlug: location, from, to }));
}

async function upsertEvent(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.locationSlug || !body.date) {
      return NextResponse.json({ error: "name + locationSlug + date required" }, { status: 400 });
    }
    const status: TruckEventStatus = VALID_STATUS.includes(body.status) ? body.status : "scheduled";
    const saved = await saveTruckEvent({
      id: body.id,
      routeId: body.routeId || undefined,
      locationSlug: body.locationSlug,
      name: body.name.trim(),
      date: body.date,
      expectedAttendance: body.expectedAttendance !== undefined ? Number(body.expectedAttendance) : undefined,
      actualRevenueGrosze: body.actualRevenueGrosze !== undefined ? Number(body.actualRevenueGrosze) : undefined,
      actualOrders: body.actualOrders !== undefined ? Number(body.actualOrders) : undefined,
      notes: body.notes,
      status,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return upsertEvent(req);
}

export async function PUT(req: NextRequest) {
  return upsertEvent(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteTruckEvent(id);
  return NextResponse.json({ ok });
}
