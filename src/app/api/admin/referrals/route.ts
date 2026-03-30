import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getReferrals, deleteReferral } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const referrals = await getReferrals();
  return NextResponse.json({ referrals });
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

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
}
