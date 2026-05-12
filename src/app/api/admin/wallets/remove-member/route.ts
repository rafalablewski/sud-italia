import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { adminForceRemoveWalletMember } from "@/lib/store";

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
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
        { status: 400 },
      );
    }

    const result = await adminForceRemoveWalletMember(walletId, phone);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  },
);
