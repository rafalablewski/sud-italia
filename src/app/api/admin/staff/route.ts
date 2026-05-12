import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { deleteStaff, getStaff, saveStaff } from "@/lib/store";
import type { StaffRole, StaffStatus } from "@/data/types";

const VALID_ROLES: StaffRole[] = ["manager", "kitchen", "front", "driver"];
const VALID_STATUS: StaffStatus[] = ["active", "inactive"];

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getStaff(locationSlug ?? undefined));
  },
);

async function upsertStaff(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!body.locationSlug) return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }
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
      dob: body.dob,
      status: body.status,
      notes: body.notes,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertStaff(req),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertStaff(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteStaff(id);
    return NextResponse.json({ ok });
  },
);
