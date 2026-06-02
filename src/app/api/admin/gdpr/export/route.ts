import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog } from "@/lib/store";
import { exportCustomerData } from "@/lib/gdpr";
import { userHasPermission } from "@/lib/permissions";

/**
 * GDPR Article 15 DSAR endpoint. Returns a single JSON blob with every
 * piece of personal data associated with the phone, suitable for handing
 * to the customer per their access request. Audit-logged so we can prove
 * compliance window when the regulator asks.
 *
 * Manager+ — exporting customer PII isn't something kitchen/staff should
 * do on a whim.
 */
export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    if (!userHasPermission(user, "customers.export")) {
      return NextResponse.json(
        { error: "Requires permission customers.export" },
        { status: 403 },
      );
    }
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }
    const data = await exportCustomerData(phone);

    await appendAuditLog({
      actor: user.email || user.id,
      action: "gdpr.export",
      entityType: "customer",
      entityId: data.phone,
      after: {
        orderCount: data.orders.length,
        noteCount: data.customerNotes.length,
        feedbackCount: data.feedback.length,
        hasLoyaltyMember: !!data.loyaltyMember,
      },
    });

    const filename = `dsar-${data.phone.replace(/\+/g, "")}-${data.exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
