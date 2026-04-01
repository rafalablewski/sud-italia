import { NextRequest, NextResponse } from "next/server";
import { findWalletByPhone, removeFamilyWalletMember } from "@/lib/store";
import { phonesEqualPl } from "@/lib/phone";
import { getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const wallet = await findWalletByPhone(session);
  if (!wallet || !phonesEqualPl(wallet.headPhone, session)) {
    return NextResponse.json(
      { error: "Only the wallet owner can remove members" },
      { status: 403 }
    );
  }

  let targetRaw = "";
  try {
    const body = await req.json();
    if (typeof body?.phone === "string") targetRaw = body.phone;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await removeFamilyWalletMember(
    wallet.id,
    session,
    targetRaw
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
