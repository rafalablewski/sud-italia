import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import { exportCustomerData } from "@/lib/gdpr";
import { appendAuditLog } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/customer/account/export` — the signed-in customer's own data,
 * portable (GDPR Art. 15 DSAR; also satisfies Apple's data-transparency
 * expectations). The token subject is the phone, so a customer only ever exports
 * their OWN record — never an arbitrary phone. Reuses the operator
 * `exportCustomerData`: loyalty member, orders, notes and feedback for the phone.
 */
export async function GET(req: NextRequest) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;
  const phone = guard.claims.sub;

  try {
    const data = await exportCustomerData(phone);
    await appendAuditLog({
      actor: phone,
      action: "account.export.self",
      entityType: "customer",
      entityId: data.phone,
      after: {
        orderCount: data.orders.length,
        noteCount: data.customerNotes.length,
        feedbackCount: data.feedback.length,
        hasLoyaltyMember: !!data.loyaltyMember,
        channel: "ottaviano-app",
      },
    });
    return apiOk(data);
  } catch (err) {
    logger.error("v1 customer account export failed", { layer: "api.v1.customer.account" }, err as Error);
    return apiError("internal", "Could not export your data");
  }
}
