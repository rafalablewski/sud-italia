import { NextRequest, NextResponse } from "next/server";
import { withAdmin, type AdminAuthContext } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  deleteStaff,
  getAdminUserByStaffId,
  getStaff,
  pinExistsAtLocation,
  provisionStaffLogin,
  saveStaff,
  setAdminUserStatus,
} from "@/lib/store";
import { userHasPermission } from "@/lib/permissions";
import { staffRoleToAdminRole } from "@/lib/staff-roles";
import { isValidPin } from "@/lib/password";
import type { StaffRole, StaffStatus } from "@/data/types";

const VALID_ROLES: StaffRole[] = [
  "manager",
  "pizzaiolo",
  "chef",
  "kp",
  "kitchen",
  "waiter",
  "front",
  "driver",
  "courier",
];
const VALID_STATUS: StaffStatus[] = ["active", "inactive"];

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getStaff(locationSlug ?? undefined));
  },
);

async function upsertStaff(req: NextRequest, auth: AdminAuthContext) {
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

    // Optional "give login access" payload. Provisioning a login is granting
    // authority, so it is gated harder than editing the roster: the caller must
    // hold `staff.hire`, and the hire flow can only mint staff/kitchen tiers —
    // never a manager/owner account (those stay with the owner via /admin/users).
    const login = body.login as
      | { enabled?: boolean; email?: string; password?: string; pin?: string }
      | undefined;
    const wantsLogin = !!login?.enabled;
    if (wantsLogin) {
      if (!userHasPermission(auth.user, "staff.hire")) {
        return NextResponse.json(
          { error: "Requires permission staff.hire to provision a login" },
          { status: 403 },
        );
      }
      const accessRole = staffRoleToAdminRole(body.role);
      if (accessRole === "manager") {
        return NextResponse.json(
          { error: "Manager logins are created by an owner in Users & roles, not via hiring." },
          { status: 403 },
        );
      }
      // A brand-new login (no linked account yet) needs at least one credential,
      // or we'd mint an account that can only fall back to the shared password.
      // Editing an existing login may leave both blank (= no credential change).
      if (!body.userId && !login.password && !login.pin) {
        return NextResponse.json(
          { error: "A password or a PIN is required to create a new login account." },
          { status: 400 },
        );
      }
      if (login.password != null && (typeof login.password !== "string" || login.password.length < 8)) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      if (login.pin != null && login.pin !== "") {
        if (!isValidPin(login.pin)) {
          return NextResponse.json({ error: "PIN must be 4–10 digits" }, { status: 400 });
        }
        // Block PIN collisions within the location, ignoring the account this
        // roster row is already linked to (so re-saving an unchanged PIN is ok).
        if (await pinExistsAtLocation(body.locationSlug, login.pin, body.userId || undefined)) {
          return NextResponse.json(
            { error: "That PIN is already in use at this location — pick another." },
            { status: 409 },
          );
        }
      }
      if (!login.email && !body.email) {
        return NextResponse.json(
          { error: "An email is required to create a login account." },
          { status: 400 },
        );
      }
    }

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
      userId: body.userId,
    });

    if (wantsLogin) {
      const account = await provisionStaffLogin({
        staff: saved,
        email: login!.email,
        plain: login!.password || undefined,
        pin: login!.pin || undefined,
      });
      return NextResponse.json({ ...saved, userId: account.id }, { status: 201 });
    }

    // Keep a linked login in lock-step with the roster: an inactive employee
    // can't sign in. (When wantsLogin is set, provisionStaffLogin already does
    // this; this branch covers a plain status edit with no login payload.)
    if (saved.userId) {
      await setAdminUserStatus(
        saved.userId,
        saved.status === "active" ? "active" : "disabled",
      );
    }

    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, auth) => upsertStaff(req, auth),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, auth) => upsertStaff(req, auth),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    // Disable the linked login rather than orphan an account that can still
    // sign in. We disable (not delete) so audit history keeps its actor.
    const linked = await getAdminUserByStaffId(id);
    const ok = await deleteStaff(id);
    if (ok && linked) await setAdminUserStatus(linked.id, "disabled");
    return NextResponse.json({ ok });
  },
);
