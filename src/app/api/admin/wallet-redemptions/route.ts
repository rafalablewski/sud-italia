import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  adminVoidWalletRedemption,
  getWalletRedemptions,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

/** Voiding a row restores spendable points for affected customers on next identify. */

export const GET = withAdmin({}, async (req) => {
  const { searchParams } = req.nextUrl;
  const walletIdFilter = searchParams.get("walletId")?.trim() || null;
  const phoneFilterRaw = searchParams.get("phone")?.trim() || null;
  const phoneNorm = phoneFilterRaw
    ? normalizePlPhoneE164(phoneFilterRaw) || phoneFilterRaw
    : null;
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(limitRaw || "200", 10) || 200),
  );

  let list = await getWalletRedemptions();

  if (walletIdFilter) {
    list = list.filter((r) => r.walletId === walletIdFilter);
  }
  if (phoneNorm) {
    list = list.filter((r) => phonesEqualPl(r.phone, phoneNorm));
  }

  list = [...list].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  list = list.slice(0, limit);

  return NextResponse.json({ redemptions: list });
});

// Voiding a redemption restores points to a customer — manager+ only.
export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
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
  },
);
