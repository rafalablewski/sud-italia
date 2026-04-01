import { NextRequest, NextResponse } from "next/server";
import { redeemLoyaltyReward } from "@/lib/store";
import { REWARDS } from "@/lib/loyalty";
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

  const reward = REWARDS.find((r) => r.id === rewardId);
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
