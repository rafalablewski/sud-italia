import { NextRequest, NextResponse } from "next/server";
import { getLoyaltyMember, updateLoyaltyMember } from "@/lib/store";
import { cookies } from "next/headers";
import { normalizePlPhoneE164 } from "@/lib/phone";

export async function PUT(req: NextRequest) {
  const cookieStore = await cookies();
  const phoneCookie = cookieStore.get("sud-italia-customer");

  if (!phoneCookie?.value) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const phone =
    normalizePlPhoneE164(decodeURIComponent(phoneCookie.value)) ??
    decodeURIComponent(phoneCookie.value).trim();
  const member = await getLoyaltyMember(phone);

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, string> = {};

  if (typeof body.name === "string" && body.name.trim() && body.name.trim().length <= 100) {
    updates.name = body.name.trim();
  }
  if (typeof body.lastName === "string" && body.lastName.trim().length <= 100) {
    updates.lastName = body.lastName.trim();
  }
  if (typeof body.nickname === "string" && body.nickname.trim().length <= 50) {
    updates.nickname = body.nickname.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await updateLoyaltyMember(phone, updates);

  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({
    customer: {
      name: updated.name,
      lastName: updated.lastName || "",
      nickname: updated.nickname || "",
    },
  });
}
