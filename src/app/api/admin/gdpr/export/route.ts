import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { appendAuditLog } from "@/lib/store";
import { exportCustomerData } from "@/lib/gdpr";

/**
 * GDPR Article 15 DSAR endpoint. Returns a single JSON blob with every
 * piece of personal data associated with the phone, suitable for handing
 * to the customer per their access request. Audit-logged so we can prove
 * compliance window when the regulator asks.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }
  const data = await exportCustomerData(phone);

  await appendAuditLog({
    actor: "admin",
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
}
