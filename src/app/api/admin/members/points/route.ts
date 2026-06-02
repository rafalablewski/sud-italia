import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getLoyaltyMembers,
  addLoyaltyMember,
  addPointAdjustment,
  getManualPointsTotal,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";
import { parseBody, pointsAdjustSchema } from "@/lib/api-schemas";
import { userHasPermission } from "@/lib/permissions";

// Manual point adjustments move loyalty currency — manager+. The adjustedBy
// audit field now records the bound user instead of the hardcoded "admin"
// string.
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    if (!userHasPermission(user, "guest.loyalty_adjust")) {
      return NextResponse.json(
        { error: "Requires permission guest.loyalty_adjust" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(req, pointsAdjustSchema);
    if ("error" in parsed) return parsed.error;
    const { phone, amount, reason } = parsed.data;

    const phoneE164 = normalizePlPhoneE164(phone);
    if (!phoneE164) {
      return NextResponse.json({ error: "Invalid Polish phone number" }, { status: 400 });
    }

    try {
      await addPointAdjustment({
        phone: phoneE164,
        amount,
        reason: reason || (amount > 0 ? "Manual points added" : "Manual points removed"),
        adjustedBy: user.email || user.id,
        adjustedAt: new Date().toISOString(),
      });

      const members = await getLoyaltyMembers();
      if (!members.some((m) => phonesEqualPl(m.phone, phoneE164))) {
        await addLoyaltyMember({
          phone: phoneE164,
          name: "Member",
          signedUpAt: new Date().toISOString(),
        });
      }

      const total = await getManualPointsTotal(phoneE164);
      return NextResponse.json({ phone: phoneE164, manualPoints: total, success: true });
    } catch (error) {
      console.error("Points adjustment error:", error);
      return NextResponse.json(
        { error: `Failed to save: ${error instanceof Error ? error.message : "unknown"}` },
        { status: 500 },
      );
    }
  },
);
