import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { adminForceRemoveWalletMember } from "@/lib/store";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let walletId = "";
  let phone = "";
  try {
    const body = await req.json();
    if (typeof body?.walletId === "string") walletId = body.walletId.trim();
    if (typeof body?.phone === "string") phone = body.phone;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!walletId || !phone) {
    return NextResponse.json(
      { error: "walletId and phone required" },
      { status: 400 }
    );
  }

  const result = await adminForceRemoveWalletMember(walletId, phone);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
