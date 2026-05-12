import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getLoyaltySettings, updateLoyaltySettings } from "@/lib/store";

// Loyalty / growth settings — points-per-PLN, tier thresholds, referral
// rewards, seasonal feature flags. Owner-only writes: these change customer
// economics chain-wide.

export const GET = withAdmin({}, async () => {
  const settings = await getLoyaltySettings();
  return NextResponse.json(settings);
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req) => {
    try {
      const updates = await req.json();
      const updated = await updateLoyaltySettings(updates);
      return NextResponse.json(updated);
    } catch {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
  },
);
