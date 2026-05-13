import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getReferrals, deleteReferral } from "@/lib/store";

export const GET = withAdmin({}, async () => {
  const referrals = await getReferrals();
  return NextResponse.json({ referrals });
});

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const { code } = await req.json();
      if (!code) {
        return NextResponse.json({ error: "Missing referral code" }, { status: 400 });
      }
      const deleted = await deleteReferral(code);
      if (!deleted) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/admin/referrals error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);
