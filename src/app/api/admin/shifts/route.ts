import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { deleteShift, getShifts, getStaff, saveShift } from "@/lib/store";
import { locations as ALL_LOCATIONS } from "@/data/locations";
import { partitionViolations, validateShift } from "@/lib/scheduling-rules";
import type { Shift, ShiftStatus, StaffRole } from "@/data/types";

const VALID_STATUS: ShiftStatus[] = ["scheduled", "in-progress", "done", "missed"];
const VALID_ROLES: StaffRole[] = ["manager", "kitchen", "front", "driver"];

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const staffId = req.nextUrl.searchParams.get("staffId") || undefined;
    const from = req.nextUrl.searchParams.get("from") || undefined;
    const to = req.nextUrl.searchParams.get("to") || undefined;
    return NextResponse.json(
      await getShifts({
        locationSlug: locationSlug ?? undefined,
        staffId,
        from,
        to,
      }),
    );
  },
);

// Scheduling mutations can ripple into Polish Labor Code violations —
// owner/manager only. Tenant check uses the body's locationSlug.
async function upsertShift(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.staffId || !body.locationSlug || !body.startAt || !body.endAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const proposed: Shift = {
      id: body.id ?? `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      staffId: body.staffId,
      locationSlug: body.locationSlug,
      startAt: body.startAt,
      endAt: body.endAt,
      role: body.role,
      status: body.status,
      notes: body.notes,
    };

    const force = req.nextUrl.searchParams.get("force") === "1";
    let warnings: ReturnType<typeof partitionViolations>["warnings"] = [];
    if (!force) {
      const [existingShifts, staffList] = await Promise.all([
        getShifts({ staffId: body.staffId }),
        getStaff(),
      ]);
      const violations = validateShift(proposed, existingShifts, staffList, [...ALL_LOCATIONS]);
      const { errors, warnings: warns } = partitionViolations(violations);
      if (errors.length > 0) {
        return NextResponse.json(
          {
            error: "Shift violates scheduling rules",
            violations: [...errors, ...warns],
          },
          { status: 409 },
        );
      }
      warnings = warns;
    }

    const saved = await saveShift(proposed);
    return NextResponse.json({ shift: saved, warnings }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["owner", "manager"] },
  async (req) => upsertShift(req),
);

export const PUT = withAdmin(
  { roles: ["owner", "manager"] },
  async (req) => upsertShift(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteShift(id);
    return NextResponse.json({ ok });
  },
);
