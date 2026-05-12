import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteStaff, getStaff, saveStaff } from "@/lib/store";
import type { StaffRole, StaffStatus } from "@/data/types";

const VALID_ROLES: StaffRole[] = ["manager", "kitchen", "front", "driver"];
const VALID_STATUS: StaffStatus[] = ["active", "inactive"];

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
  return NextResponse.json(await getStaff(location));
}

async function upsertStaff(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!body.locationSlug) return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const saved = await saveStaff({
      id: body.id,
      name: body.name.trim(),
      phone: body.phone,
      email: body.email,
      role: body.role,
      locationSlug: body.locationSlug,
      hourlyRateGrosze: Math.max(0, Number(body.hourlyRateGrosze) || 0),
      hireDate: body.hireDate,
      status: body.status,
      notes: body.notes,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return upsertStaff(req);
}

export async function PUT(req: NextRequest) {
  return upsertStaff(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteStaff(id);
  return NextResponse.json({ ok });
}
