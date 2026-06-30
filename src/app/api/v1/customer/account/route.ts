import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import { deleteCustomerData } from "@/lib/gdpr";
import { appendAuditLog, revokeApiRefreshTokensForUser } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `DELETE /api/v1/customer/account` — self-serve account deletion for the signed-
 * in customer (Apple App Store Guideline 5.1.1(v): an app that supports account
 * creation MUST let the user initiate deletion from within the app; also GDPR
 * Art. 17 erasure). The token subject is the phone, so a customer can only erase
 * their OWN data — no phone is accepted from the body. Requires an explicit
 * `{ confirm: true }` so a stray DELETE can't wipe an account.
 *
 * Reuses the same `deleteCustomerData` the operator GDPR tool uses (identity
 * redacted from orders/feedback so accounting/JPK totals stay intact, notes +
 * loyalty row removed, deterministic tombstone), then revokes every refresh
 * token for the phone so the account is signed out of all devices.
 */
export async function DELETE(req: NextRequest) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;
  const phone = guard.claims.sub;

  let body: { confirm?: unknown };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  if (body.confirm !== true) {
    return apiError("validation_failed", "Set confirm:true to delete the account");
  }

  try {
    const result = await deleteCustomerData(phone);
    const revokedSessions = await revokeApiRefreshTokensForUser(phone, "ottaviano");
    await appendAuditLog({
      actor: phone,
      action: "account.delete.self",
      entityType: "customer",
      entityId: result.phone,
      before: { phone: result.phone },
      after: {
        tombstone: result.tombstone,
        redactedOrders: result.redactedOrders,
        removedNotes: result.removedNotes,
        removedLoyaltyMember: result.removedLoyaltyMember,
        redactedFeedback: result.redactedFeedback,
        revokedSessions,
        channel: "ottaviano-app",
      },
    });
    return apiOk({
      deleted: true,
      deletedAt: result.deletedAt,
      redactedOrders: result.redactedOrders,
      removedNotes: result.removedNotes,
      removedLoyaltyMember: result.removedLoyaltyMember,
      redactedFeedback: result.redactedFeedback,
      revokedSessions,
    });
  } catch (err) {
    logger.error("v1 customer account delete failed", { layer: "api.v1.customer.account" }, err as Error);
    return apiError("internal", "Could not delete the account");
  }
}
