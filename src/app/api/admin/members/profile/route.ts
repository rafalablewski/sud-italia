import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  addLoyaltyMember,
  appendAuditLog,
  getLoyaltyMember,
  updateLoyaltyMember,
} from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

/**
 * Update a customer's profile fields (today: `dob` and `email`). Phone is the
 * key — we look the member up via the canonical PL E.164 form and create the
 * record if it doesn't exist yet, so a manager can set a DOB even for a
 * customer who hasn't signed up to loyalty explicitly.
 *
 * Lays the groundwork for birthday / anniversary triggers — see
 * `/api/admin/campaigns/triggers`.
 */
export const PUT = withAdmin(
  { roles: ["staff", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    let body: {
      phone?: string;
      dob?: string;
      email?: string;
      name?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }
    const canonical = normalizePlPhoneE164(body.phone) || body.phone.trim();

    if (body.dob && Number.isNaN(new Date(body.dob).getTime())) {
      return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
    }

    const existing = await getLoyaltyMember(canonical);
    let result;
    if (existing) {
      result = await updateLoyaltyMember(canonical, {
        dob: body.dob,
        email: body.email,
      });
    } else {
      result = await addLoyaltyMember({
        phone: canonical,
        name: body.name?.trim() || "Customer",
        email: body.email,
        dob: body.dob,
        signedUpAt: new Date().toISOString(),
      });
    }

    await appendAuditLog({
      actor: user.email || user.id,
      action: "members.profile_update",
      entityType: "loyalty_member",
      entityId: canonical,
      after: { dob: body.dob, email: body.email },
    });

    return NextResponse.json(result);
  },
);
