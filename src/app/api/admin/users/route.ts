import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, hasRole } from "@/lib/admin-auth";
import { appendAuditLog, deleteAdminUser, getAdminUsers, saveAdminUser } from "@/lib/store";
import type { AdminRole, AdminUserStatus } from "@/data/types";

const VALID_ROLES: AdminRole[] = ["owner", "manager", "staff", "kitchen"];
const VALID_STATUS: AdminUserStatus[] = ["active", "disabled"];

async function requireAuth() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

async function requireOwnerOrManager() {
  if (!(await hasRole(["owner", "manager"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth) return auth;
  return NextResponse.json(await getAdminUsers());
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const role = await requireOwnerOrManager();
  if (role) return role;
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
      actor: "admin",
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

export async function PUT(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const role = await requireOwnerOrManager();
  if (role) return role;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteAdminUser(id);
  if (ok) {
    await appendAuditLog({
      actor: "admin",
      action: "users.delete",
      entityType: "admin_user",
      entityId: id,
    });
  }
  return NextResponse.json({ ok });
}
