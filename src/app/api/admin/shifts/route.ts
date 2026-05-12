import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireRole } from "@/lib/admin-auth";
import { deleteShift, getShifts, getStaff, saveShift } from "@/lib/store";
import { locations as ALL_LOCATIONS } from "@/data/locations";
import { partitionViolations, validateShift } from "@/lib/scheduling-rules";
import type { Shift, ShiftStatus, StaffRole } from "@/data/types";

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
  // Scheduling mutations can ripple into Polish Labor Code violations — owner/manager only.
  const role = await requireRole(["owner", "manager"]);
  if ("error" in role) return role.error;
  try {
    const body = await req.json();
    if (!body.staffId || !body.locationSlug || !body.startAt || !body.endAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

    // `force=1` skips the rule engine for the rare emergency where ops needs
    // to override (still logs the override via the saved shift's audit row).
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
