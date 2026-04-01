import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  adminVoidWalletRedemption,
  getWalletRedemptions,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

/** Voiding a row restores spendable points for affected customers on next identify. */

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const walletIdFilter = searchParams.get("walletId")?.trim() || null;
  const phoneFilterRaw = searchParams.get("phone")?.trim() || null;
  const phoneNorm = phoneFilterRaw
    ? normalizePlPhoneE164(phoneFilterRaw) || phoneFilterRaw
    : null;
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(limitRaw || "200", 10) || 200)
  );

  let list = await getWalletRedemptions();

  if (walletIdFilter) {
    list = list.filter((r) => r.walletId === walletIdFilter);
  }
  if (phoneNorm) {
    list = list.filter((r) => phonesEqualPl(r.phone, phoneNorm));
  }

  list = [...list].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  list = list.slice(0, limit);

  return NextResponse.json({ redemptions: list });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let id = "";
  try {
    const body = await req.json();
    if (typeof body?.id === "string") id = body.id.trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const ok = await adminVoidWalletRedemption(id);
  if (!ok) {
    return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
