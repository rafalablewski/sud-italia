import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteShift, getShifts, saveShift } from "@/lib/store";
import type { ShiftStatus, StaffRole } from "@/data/types";

const VALID_STATUS: ShiftStatus[] = ["scheduled", "in-progress", "done", "missed"];
const VALID_ROLES: StaffRole[] = ["manager", "kitchen", "front", "driver"];

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  const staffId = req.nextUrl.searchParams.get("staffId") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  return NextResponse.json(await getShifts({ locationSlug: location, staffId, from, to }));
}

async function upsertShift(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.staffId || !body.locationSlug || !body.startAt || !body.endAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const saved = await saveShift({
      id: body.id,
      staffId: body.staffId,
      locationSlug: body.locationSlug,
      startAt: body.startAt,
      endAt: body.endAt,
      role: body.role,
      status: body.status,
      notes: body.notes,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return upsertShift(req);
}

export async function PUT(req: NextRequest) {
  return upsertShift(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteShift(id);
  return NextResponse.json({ ok });
}
