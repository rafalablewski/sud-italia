import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { deleteSupplier, getSuppliers, saveSupplier } from "@/lib/store";

// Suppliers are chain-wide. Writes are manager+ because cost/lead-time
// changes propagate into PO planning and food-cost reports.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getSuppliers());
});

async function upsertSupplier(req: NextRequest) {
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

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertSupplier(req),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertSupplier(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteSupplier(id);
    return NextResponse.json({ ok });
  },
);
