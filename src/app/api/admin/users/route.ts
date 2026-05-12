import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, deleteAdminUser, getAdminUsers, saveAdminUser } from "@/lib/store";
import type { AdminRole, AdminUserStatus } from "@/data/types";

const VALID_ROLES: AdminRole[] = ["owner", "manager", "staff", "kitchen"];
const VALID_STATUS: AdminUserStatus[] = ["active", "disabled"];

// Admin-user mgmt is itself a privileged surface — manager+ for writes,
// any-auth for reads (so the admin/users page can show the roster).
export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getAdminUsers());
});

async function upsertUser(req: NextRequest, actor: string) {
  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const saved = await saveAdminUser({
      id: body.id,
      name: body.name.trim(),
      email: body.email,
      role: body.role,
      status: body.status,
      locationSlug: body.locationSlug,
      notes: body.notes,
    });
    await appendAuditLog({
      actor,
      action: body.id ? "users.update" : "users.create",
      entityType: "admin_user",
      entityId: saved.id,
      after: saved,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
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
