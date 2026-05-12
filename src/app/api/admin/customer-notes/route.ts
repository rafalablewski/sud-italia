import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { addCustomerNote, deleteCustomerNote, getCustomerNotes } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const phoneRaw = req.nextUrl.searchParams.get("phone");
  if (!phoneRaw) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  const phone = normalizePlPhoneE164(phoneRaw) ?? phoneRaw;
  return NextResponse.json(await getCustomerNotes(phone));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.phone || !body.body?.trim()) {
      return NextResponse.json({ error: "Missing phone or body" }, { status: 400 });
    }
    const phone = normalizePlPhoneE164(body.phone) ?? body.phone;
    const saved = await addCustomerNote({
      phone,
      body: String(body.body).trim(),
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      authoredBy: body.authoredBy || "admin",
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteCustomerNote(id);
  return NextResponse.json({ ok });
}
