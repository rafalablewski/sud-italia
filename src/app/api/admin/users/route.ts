import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, deleteAdminUser, getAdminUsers, saveAdminUser } from "@/lib/store";
import { adminUserUpsertSchema, parseBody } from "@/lib/api-schemas";
import type { AdminRole } from "@/lib/admin-roles";

/**
 * Managing admin accounts is itself the act of *granting authority* — roles,
 * location scope, and now granular permissions. That is owner-only (the
 * "only admin can grant" rule): a manager can run the floor, but only an owner
 * decides who can do what.
 *
 * The `roles: ["owner"]` gate stops role-default managers at withAdmin; this
 * explicit check additionally blocks a custom-grant user who was handed
 * `users.edit` — because for custom users permissions override role rank, the
 * path-mapped users.edit would otherwise let them through. Granting stays with
 * owners, full stop. Reads (GET) remain any-auth so the page can list the
 * roster.
 */
function ownerOnly(user: { role: AdminRole }) {
  return user.role === "owner"
    ? null
    : NextResponse.json(
        { error: "Only an owner can manage users and grant permissions" },
        { status: 403 },
      );
}

// Admin-user mgmt is itself a privileged surface — owner-only for writes,
// any-auth for reads (so the admin/users page can show the roster).
export const GET = withAdmin({}, async () => {
  // Never ship secrets to the client — strip the TOTP secret and the password
  // / PIN hashes, exposing only boolean "is it set" flags.
  const users = (await getAdminUsers()).map((u) => {
    const {
      totpSecret,
      passwordHash,
      pinHash,
      webauthnCredentials,
      currentWebauthnChallenge,
      ...rest
    } = u;
    void totpSecret;
    void currentWebauthnChallenge;
    return {
      ...rest,
      totpEnabled: !!u.totpEnabled,
      hasPassword: !!passwordHash,
      hasPin: !!pinHash,
      // Sanitized key list (no public key, no counter) for the management UI.
      webauthnKeys: (webauthnCredentials ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        transports: c.transports,
      })),
    };
  });
  return NextResponse.json(users);
});

async function upsertUser(req: NextRequest, actor: string) {
  const parsed = await parseBody(req, adminUserUpsertSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const saved = await saveAdminUser({
    id: body.id,
    name: body.name.trim(),
    email: body.email,
    role: body.role,
    status: body.status,
    locationSlug: body.locationSlug,
    locationSlugs: body.locationSlugs,
    notes: body.notes,
    // `undefined` leaves the stored grant untouched, `null` resets to role
    // defaults, an array sets a custom grant (see saveAdminUser).
    permissions: body.permissions,
  });
  await appendAuditLog({
    actor,
    action: body.id ? "users.update" : "users.create",
    entityType: "admin_user",
    entityId: saved.id,
    after: saved,
  });
  return NextResponse.json(saved, { status: 201 });
}

export const POST = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) =>
    ownerOnly(user) ?? upsertUser(req, user.email || user.id),
);

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) =>
    ownerOnly(user) ?? upsertUser(req, user.email || user.id),
);

export const DELETE = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const denied = ownerOnly(user);
    if (denied) return denied;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteAdminUser(id);
    if (ok) {
      await appendAuditLog({
        actor: user.email || user.id,
        action: "users.delete",
        entityType: "admin_user",
        entityId: id,
      });
    }
    return NextResponse.json({ ok });
  },
);
