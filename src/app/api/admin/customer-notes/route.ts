import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { addCustomerNote, deleteCustomerNote, getCustomerNotes } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { customerNoteCreateSchema, parseBody } from "@/lib/api-schemas";

// Customer notes are chain-wide (linked to phone, not location). Any
// authenticated staff can read; writing notes is staff+; deleting is
// manager+ so an angry front-of-house can't erase a "watch out, this
// customer files chargebacks" note.

export const GET = withAdmin({}, async (req) => {
  const phoneRaw = req.nextUrl.searchParams.get("phone");
  if (!phoneRaw) return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  const phone = normalizePlPhoneE164(phoneRaw) ?? phoneRaw;
  return NextResponse.json(await getCustomerNotes(phone));
});

export const POST = withAdmin(
  { roles: ["staff", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, customerNoteCreateSchema);
    if ("error" in parsed) return parsed.error;
    const { phone: rawPhone, body, tags, authoredBy } = parsed.data;
    const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
    const saved = await addCustomerNote({
      phone,
      body: body.trim(),
      tags,
      authoredBy: authoredBy || user.email || user.id,
    });
    return NextResponse.json(saved, { status: 201 });
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteCustomerNote(id);
    return NextResponse.json({ ok });
  },
);
