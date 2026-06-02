import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, deleteAdminUser, getAdminUsers, saveAdminUser } from "@/lib/store";
import { adminUserUpsertSchema, parseBody } from "@/lib/api-schemas";

// Admin-user mgmt is itself a privileged surface — manager+ for writes,
// any-auth for reads (so the admin/users page can show the roster).
export const GET = withAdmin({}, async () => {
  // Never ship the TOTP secret to the client — expose only the boolean flag.
  const users = (await getAdminUsers()).map((u) => {
    const { totpSecret, ...rest } = u;
    void totpSecret;
    return { ...rest, totpEnabled: !!u.totpEnabled };
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
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => upsertUser(req, user.email || user.id),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => upsertUser(req, user.email || user.id),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
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
