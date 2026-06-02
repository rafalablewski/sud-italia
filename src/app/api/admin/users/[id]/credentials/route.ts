import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getAdminUserById,
  pinExistsAnywhere,
  pinExistsAtLocation,
  setAdminUserCredentials,
} from "@/lib/store";
import { isValidPin } from "@/lib/password";
import { z } from "zod";
import { parseBody } from "@/lib/api-schemas";

/**
 * Owner-managed credential reset for an admin account.
 *
 *   POST { password }            → set/replace the per-user password.
 *   POST { pin }                 → set/replace the terminal PIN.
 *   POST { password: null }      → clear the password (back to shared fallback).
 *   POST { pin: null }           → clear the PIN.
 *
 * Setting a credential IS granting authority, so this mirrors /api/admin/users:
 * owner-only. A manager provisions staff credentials through the hire flow
 * (`staff.hire`), not here.
 */
const schema = z.object({
  password: z.string().min(8).max(500).nullable().optional(),
  pin: z.string().regex(/^\d{4,10}$/).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdmin<Ctx>({ roles: ["owner"] }, async (req: NextRequest, ctx, { user }) => {
  if (user.role !== "owner") {
    return NextResponse.json(
      { error: "Only an owner can reset another account's credentials" },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { password, pin } = parsed.data;

  if (password === undefined && pin === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const target = await getAdminUserById(id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Reject a colliding PIN. A located account need only be unique within its
  // site (+ owners, who match everywhere); an unscoped account (owner / no
  // location) matches at every terminal, so it must be globally unique —
  // otherwise the per-location check is skipped and the collision slips through.
  if (typeof pin === "string" && isValidPin(pin)) {
    const collision = target.locationSlug
      ? await pinExistsAtLocation(target.locationSlug, pin, id)
      : await pinExistsAnywhere(pin, id);
    if (collision) {
      return NextResponse.json(
        { error: "That PIN is already in use — pick another." },
        { status: 409 },
      );
    }
  }

  const updated = await setAdminUserCredentials(id, { plain: password, pin });
  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await appendAuditLog({
    actor: user.email || user.id,
    action: "users.credentials_set",
    entityType: "admin_user",
    entityId: id,
    after: {
      passwordSet: password !== undefined ? password !== null : undefined,
      pinSet: pin !== undefined ? pin !== null : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    hasPassword: !!updated.passwordHash,
    hasPin: !!updated.pinHash,
  });
});
