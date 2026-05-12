import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteSupplier, getSuppliers, saveSupplier } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth) return auth;
  return NextResponse.json(await getSuppliers());
}

/** Shared upsert: both POST (create) and PUT (replace) accept the same body
 * with an optional id. Keeping a single source of truth avoids drift between
 * the two handlers and matches the store's `saveSupplier` upsert semantics. */
async function upsertSupplier(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    const saved = await saveSupplier({
      id: body.id,
      name: body.name.trim(),
      contactName: body.contactName,
      email: body.email,
      phone: body.phone,
      leadTimeDays: body.leadTimeDays !== undefined ? Number(body.leadTimeDays) : undefined,
      notes: body.notes,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return upsertSupplier(req);
}

export async function PUT(req: NextRequest) {
  return upsertSupplier(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteSupplier(id);
  return NextResponse.json({ ok });
}
