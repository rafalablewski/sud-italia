import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setLoyaltyMemberHouseholdLabels, getLoyaltyMember } from "@/lib/store";
import { MAX_HOUSEHOLD_EXTRA_LABELS } from "@/lib/constants";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

export async function PUT(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("sud-italia-customer")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const phone =
    normalizePlPhoneE164(decodeURIComponent(raw)) ??
    decodeURIComponent(raw).trim();

  const ownerRaw = cookieStore.get("sud-italia-number-owner")?.value;
  const ownerDecoded = ownerRaw
    ? normalizePlPhoneE164(decodeURIComponent(ownerRaw)) ??
      decodeURIComponent(ownerRaw).trim()
    : null;
  if (!ownerDecoded || !phonesEqualPl(ownerDecoded, phone)) {
    return NextResponse.json(
      { error: "Only the verified number owner can edit the family list" },
      { status: 403 }
    );
  }

  const member = await getLoyaltyMember(phone);
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let labels: unknown;
  try {
    const body = await req.json();
    labels = body?.labels;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!Array.isArray(labels)) {
    return NextResponse.json({ error: "labels must be an array" }, { status: 400 });
  }

  const strs = labels
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_HOUSEHOLD_EXTRA_LABELS);

  const updated = await setLoyaltyMemberHouseholdLabels(phone, strs);
  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ householdLabels: updated.householdLabels ?? [] });
}
