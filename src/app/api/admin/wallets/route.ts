import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  adminDeleteFamilyWallet,
  getAdminWalletSummaries,
} from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

/** Dissolving wallets does not delete orders — only the grouping. Voiding redemptions changes spendable balance. */

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallets = await getAdminWalletSummaries();
  const phoneToWalletId: Record<string, string> = {};
  for (const w of wallets) {
    for (const m of w.members) {
      const key = normalizePlPhoneE164(m.phone) || m.phone.trim();
      phoneToWalletId[key] = w.id;
    }
  }

  return NextResponse.json({ wallets, phoneToWalletId });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let walletId = "";
  try {
    const body = await req.json();
    if (typeof body?.walletId === "string") walletId = body.walletId.trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!walletId) {
    return NextResponse.json({ error: "walletId required" }, { status: 400 });
  }

  const ok = await adminDeleteFamilyWallet(walletId);
  if (!ok) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
