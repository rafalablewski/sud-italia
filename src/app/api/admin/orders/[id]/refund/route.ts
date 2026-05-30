import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCurrentActor, hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  getActorCompTotalToday,
  getOrderById,
  getSettings,
  updateOrder,
} from "@/lib/store";
import { restoreRecipeForOrder } from "@/lib/inventory-decrement";
import { logger } from "@/lib/logger";
import { type OrderRefund } from "@/data/types";
import { parseBody, refundBodySchema } from "@/lib/api-schemas";
import {
  DEFAULT_REFUND_CONTROLS,
  evaluateRefundGuard,
} from "@/lib/refund-guard";

// Refunds reach back to Stripe and to revenue rows — owner/manager only.
// Per-order tenancy check happens inside the handler because the order's
// locationSlug isn't known until we read it.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["owner", "manager"] },
  async (req, { params }, { user }) => {
    const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const parsed = await parseBody(req, refundBodySchema);
  if ("error" in parsed) return parsed.error;
  const { type, amount, reasonCode, notes } = parsed.data;

  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // A manager scoped to one location must not be able to refund orders at
  // another location (which would also wipe revenue rows the other location's
  // owner is reconciling). Wildcard scope passes through.
  if (!(await hasLocationAccess(order.locationSlug))) {
    return NextResponse.json(
      { error: `Session is not authorized for location "${order.locationSlug}"` },
      { status: 403 },
    );
  }

  if (order.refund) {
    return NextResponse.json(
      { error: "Order already refunded" },
      { status: 409 },
    );
  }

  // Schema guarantees `amount` is a positive integer when `type === "partial"`.
  const refundAmount = type === "full" ? order.totalAmount : (amount as number);

  if (refundAmount > order.totalAmount) {
    return NextResponse.json(
      { error: "Refund amount exceeds order total" },
      { status: 400 },
    );
  }

  // Authorization caps (audit §11.2) — a per-refund ceiling and a per-actor
  // daily comp cap stop one manager from comping the whole shift. Owners
  // bypass. Checked BEFORE Stripe so a blocked refund never reverses a charge.
  const actor = await getCurrentActor();
  const limits = (await getSettings()).refundControls ?? DEFAULT_REFUND_CONTROLS;
  const compTotalToday =
    reasonCode === "manager_comp"
      ? await getActorCompTotalToday(actor, order.locationSlug)
      : 0;
  const guard = evaluateRefundGuard({
    role: user.role,
    reasonCode,
    amountGrosze: refundAmount,
    actorCompTotalTodayGrosze: compTotalToday,
    limits,
  });
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.message, guardCode: guard.code },
      { status: 403 },
    );
  }

  // Reverse the original Stripe charge when we have the correlation ids.
  // Comps (manager_comp) and demo-mode orders skip Stripe and only attach an
  // internal refund record.
  let stripeRefundId: string | undefined;
  const shouldCallStripe =
    reasonCode !== "manager_comp" &&
    !!order.stripePaymentIntentId &&
    !!process.env.STRIPE_SECRET_KEY;

  if (shouldCallStripe) {
    try {
      const stripe = (await import("stripe")).default;
      const client = new stripe(process.env.STRIPE_SECRET_KEY as string);
      const refund = await client.refunds.create({
        payment_intent: order.stripePaymentIntentId as string,
        amount: refundAmount,
        reason:
          reasonCode === "duplicate_charge"
            ? "duplicate"
            : reasonCode === "customer_request"
              ? "requested_by_customer"
              : undefined,
        metadata: {
          orderId: order.id,
          reasonCode,
          refundType: type,
        },
      });
      stripeRefundId = refund.id;
    } catch (err) {
      logger.error(
        "Stripe refund failed",
        {
          route: "POST /api/admin/orders/[id]/refund",
          orderId,
          paymentIntentId: order.stripePaymentIntentId,
          amount: refundAmount,
          reasonCode,
        },
        err,
      );
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Stripe refund failed",
        },
        { status: 502 },
      );
    }
  }

  const refundRecord: OrderRefund = {
    type,
    amount: refundAmount,
    reasonCode,
    notes: notes?.trim() || undefined,
    stripeRefundId,
    refundedBy: actor,
    refundedAt: new Date().toISOString(),
  };

  const updated = await updateOrder(orderId, {
    refund: refundRecord,
    // A full refund retires the order. Partial refunds leave the lifecycle
    // status untouched so a kitchen ticket that's already prepping/ready can
    // still be completed.
    ...(type === "full" ? { status: "cancelled" as const } : {}),
  });

  if (!updated) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  await appendAuditLog({
    actor,
    action: type === "full" ? "orders.refund_full" : "orders.refund_partial",
    entityType: "order",
    entityId: orderId,
    before: { totalAmount: order.totalAmount, status: order.status },
    after: {
      refundAmount,
      reasonCode,
      // locationSlug + reasonCode here are what getActorCompTotalToday reads to
      // enforce the per-shift comp cap on the next refund.
      locationSlug: order.locationSlug,
      stripeRefundId: stripeRefundId ?? null,
      newStatus: updated.status,
    },
  });

  // Notify other admins about the refund so concurrent operators can see
  // it in their lock-screen. The actor doesn't need a push about their
  // own action — passes through excludeUserId.
  void (async () => {
    try {
      const { pushToAdmins, ADMIN_PUSH_TEMPLATES } = await import("@/lib/admin-push");
      const { getCurrentAdminUser } = await import("@/lib/admin-auth");
      const me = await getCurrentAdminUser();
      const amountZl = `${(refundAmount / 100).toFixed(2)} zł`;
      await pushToAdmins(
        ADMIN_PUSH_TEMPLATES.refundProcessed(orderId, amountZl, actor),
        me ? { excludeUserId: me.id } : {},
      );
    } catch {
      /* push is best-effort */
    }
  })();

  // Audit §3 fix — refunds previously bypassed stock reconciliation,
  // leaving ghost-consumed ingredients in the books. A full refund
  // returns the recipe-predicted draw. Partial refunds don't carry
  // line-level data so we leave them; rare and the operator can
  // reconcile from the audit log.
  if (type === "full") {
    void restoreRecipeForOrder(updated, "refund");
  }

    return NextResponse.json(updated);
  },
);
