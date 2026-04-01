import { NextRequest, NextResponse } from "next/server";
import { confirmFamilyWalletMember } from "@/lib/store";
import { getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let code = "";
  try {
    const body = await req.json();
    if (typeof body?.code === "string") code = body.code;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await confirmFamilyWalletMember(session, code);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wallet: result.wallet });
}
