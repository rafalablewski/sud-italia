import { NextRequest, NextResponse } from "next/server";
import { redeemLoyaltyReward, getLoyaltySettings } from "@/lib/store";
import { getCustomerSessionPhone } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const session = await getCustomerSessionPhone();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let rewardId = "";
  try {
    const body = await req.json();
    if (typeof body?.rewardId === "string") rewardId = body.rewardId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Validate against the live admin-managed rewards catalogue. Inactive
  // rewards are rejected here too so a deactivated reward can't be
  // redeemed via a stale client.
  const loyalty = await getLoyaltySettings();
  const reward = loyalty.rewards.find((r) => r.id === rewardId && r.active);
  if (!reward) {
    return NextResponse.json({ error: "Unknown reward" }, { status: 400 });
  }

  const result = await redeemLoyaltyReward(
    session,
    reward.id,
    reward.pointsCost
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
