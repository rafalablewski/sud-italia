import { NextResponse } from "next/server";
import { createFamilyWallet, findWalletByPhone } from "@/lib/store";
import { getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST() {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const existing = await findWalletByPhone(session);
  if (existing) {
    return NextResponse.json(
      { error: "This number is already in a family wallet" },
      { status: 400 }
    );
  }

  const wallet = await createFamilyWallet(session);
  if (!wallet) {
    return NextResponse.json(
      { error: "Could not create wallet" },
      { status: 400 }
    );
  }

  return NextResponse.json({ wallet });
}
