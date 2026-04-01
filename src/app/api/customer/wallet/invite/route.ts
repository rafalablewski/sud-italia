import { NextRequest, NextResponse } from "next/server";
import {
  findWalletByPhone,
  inviteFamilyWalletMember,
  storeWalletInviteOtp,
} from "@/lib/store";
import { phonesEqualPl } from "@/lib/phone";
import { genWalletInviteOtp, getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const wallet = await findWalletByPhone(session);
  if (!wallet || !phonesEqualPl(wallet.headPhone, session)) {
    return NextResponse.json(
      { error: "Only the wallet owner can invite" },
      { status: 403 }
    );
  }

  let inviteeRaw = "";
  try {
    const body = await req.json();
    if (typeof body?.phone === "string") inviteeRaw = body.phone;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const invited = await inviteFamilyWalletMember(
    wallet.id,
    session,
    inviteeRaw
  );
  if ("error" in invited) {
    return NextResponse.json({ error: invited.error }, { status: 400 });
  }

  const code = genWalletInviteOtp();
  await storeWalletInviteOtp(invited.invitee, wallet.id, code);

  if (process.env.NODE_ENV === "development") {
    console.info(`[wallet-invite-otp] ${invited.invitee}: ${code}`);
  }

  const payload: { ok: boolean; resent: boolean; devCode?: string } = {
    ok: true,
    resent: invited.resent,
  };
  if (process.env.NODE_ENV === "development") {
    payload.devCode = code;
  }

  return NextResponse.json(payload);
}
