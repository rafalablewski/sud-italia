import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  getLoyaltyMembers,
  addLoyaltyMember,
  addPointAdjustment,
  getManualPointsTotal,
} from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phone, amount, reason } = body;

  if (!phone || typeof amount !== "number" || amount === 0) {
    return NextResponse.json({ error: "Phone and non-zero amount required" }, { status: 400 });
  }

  try {
    await addPointAdjustment({
      phone,
      amount,
      reason: reason || (amount > 0 ? "Manual points added" : "Manual points removed"),
      adjustedBy: "admin",
      adjustedAt: new Date().toISOString(),
    });

    // Ensure the member exists
    const members = await getLoyaltyMembers();
    if (!members.some((m) => m.phone === phone)) {
      await addLoyaltyMember({
        phone,
        name: "Member",
        signedUpAt: new Date().toISOString(),
      });
    }

    const total = await getManualPointsTotal(phone);
    return NextResponse.json({ phone, manualPoints: total, success: true });
  } catch (error) {
    console.error("Points adjustment error:", error);
    return NextResponse.json(
      { error: `Failed to save: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 }
    );
  }
}
