import { NextResponse } from "next/server";
import { findWalletByPhone, leaveFamilyWallet } from "@/lib/store";
import { getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST() {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const wallet = await findWalletByPhone(session);
  if (!wallet) {
    return NextResponse.json({ error: "No wallet" }, { status: 404 });
  }

  const result = await leaveFamilyWallet(wallet.id, session);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
