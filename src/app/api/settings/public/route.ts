import { NextResponse } from "next/server";
import { getLoyaltySettings } from "@/lib/store";

// Public endpoint — returns only non-sensitive settings needed by the frontend
export async function GET() {
  const settings = await getLoyaltySettings();

  return NextResponse.json({
    liveActivity: settings.liveActivity,
    speedGuarantee: {
      active: settings.speedGuarantee.active,
      maxMinutes: settings.speedGuarantee.maxMinutes,
      guaranteeText: settings.speedGuarantee.guaranteeText,
    },
    abandonedCart: {
      active: settings.abandonedCart.active,
      delaySeconds: settings.abandonedCart.delaySeconds,
      message: settings.abandonedCart.message,
    },
  });
}
