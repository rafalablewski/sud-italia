import { getOrderById, updateOrder, appendAuditLog } from "@/lib/store";
import { registerTool } from "./registry";
import type { OrderRefund, RefundReasonCode } from "@/data/types";
import { logger } from "@/lib/logger";

/**
 * refund_order — manager+. Mirrors the logic in
 * /api/admin/orders/[id]/refund/route.ts but reachable from the agent
 * loop. Stripe is hit only when the order has a payment intent AND
 * STRIPE_SECRET_KEY is configured AND the reason isn't a manager comp.
 * Comps and demo orders only get the internal refund record.
 *
 * Dry-run returns a preview card the operator confirms before the
 * actual Stripe call. Once confirmed, the agent calls the tool again
 * with dryRun=false.
 */

type RefundType = "full" | "partial";
type RefundReason = RefundReasonCode;

registerTool<{
  orderId: string;
  type: RefundType;
  amountGrosze?: number;
  reasonCode: RefundReason;
  notes?: string;
}>({
  name: "refund_order",
  description:
    "Issue a refund for an order. Use type='full' for a complete refund or 'partial' " +
    "with `amountGrosze` for a partial. Reason 'manager_comp' skips Stripe and only " +
    "records an internal credit. Manager+ only.",
  minRole: "manager",
  mutates: true,
  inputSchema: {
    type: "object" as const,
    properties: {
      orderId: { type: "string", description: "Order ID to refund." },
      type: {
        type: "string",
        enum: ["full", "partial"],
        description: "Refund the entire order ('full') or a portion ('partial').",
      },
      amountGrosze: {
        type: "number",
        description: "Required when type='partial'. Amount in grosze (1 PLN = 100 grosze).",
      },
      reasonCode: {
        type: "string",
        enum: [
          "customer_request",
          "wrong_item",
          "quality_issue",
          "late_or_no_show",
          "missing_item",
          "duplicate_charge",
          "manager_comp",
          "other",
        ],
        description: "Why the refund is being issued. 'manager_comp' skips Stripe.",
      },
      notes: { type: "string", description: "Optional free-text notes for the audit log." },
    },
    required: ["orderId", "type", "reasonCode"],
  },
  async execute(input, ctx) {
    const order = await getOrderById(input.orderId);
    if (!order) return { ok: false, error: `Order '${input.orderId}' not found` };

    if (
      ctx.actor.locationScope !== "*" &&
      !ctx.actor.locationScope.split(",").includes(order.locationSlug)
    ) {
      return { ok: false, error: `Session is not authorized for location '${order.locationSlug}'` };
    }
    if (order.refund) return { ok: false, error: "Order already refunded" };

    if (input.type === "partial" && !input.amountGrosze) {
      return { ok: false, error: "amountGrosze is required for partial refunds" };
    }

    const refundAmount = input.type === "full" ? order.totalAmount : input.amountGrosze!;
    if (refundAmount > order.totalAmount) {
      return { ok: false, error: "Refund amount exceeds order total" };
    }

    if (ctx.dryRun) {
      return {
        ok: true,
        preview:
          `Refund ${(refundAmount / 100).toFixed(2)} PLN to order ${order.id} ` +
          `(${input.type}, reason=${input.reasonCode})` +
          (input.notes ? ` — notes: ${input.notes}` : ""),
      };
    }

    const shouldCallStripe =
      input.reasonCode !== "manager_comp" &&
      !!order.stripePaymentIntentId &&
      !!process.env.STRIPE_SECRET_KEY;

    let stripeRefundId: string | undefined;
    if (shouldCallStripe) {
      try {
        const stripe = (await import("stripe")).default;
        const client = new stripe(process.env.STRIPE_SECRET_KEY as string);
        const refund = await client.refunds.create({
          payment_intent: order.stripePaymentIntentId as string,
          amount: refundAmount,
          reason:
            input.reasonCode === "duplicate_charge"
              ? "duplicate"
              : input.reasonCode === "customer_request"
                ? "requested_by_customer"
                : undefined,
          metadata: { orderId: order.id, reasonCode: input.reasonCode, refundType: input.type },
        });
        stripeRefundId = refund.id;
      } catch (err) {
        logger.error(
          "ai.tool.refund.stripe_failed",
          { orderId: order.id, paymentIntentId: order.stripePaymentIntentId },
          err,
        );
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Stripe refund failed",
        };
      }
    }

    const refundRecord: OrderRefund = {
      type: input.type,
      amount: refundAmount,
      reasonCode: input.reasonCode,
      notes: input.notes?.trim() || undefined,
      stripeRefundId,
      refundedBy: `claude:${ctx.actor.userId}`,
      refundedAt: new Date().toISOString(),
    };

    const updated = await updateOrder(order.id, {
      refund: refundRecord,
      ...(input.type === "full" ? { status: "cancelled" as const } : {}),
    });

    await appendAuditLog({
      actor: `claude:${ctx.actor.userId}`,
      action: "orders.refund",
      entityType: "order",
      entityId: order.id,
      before: { status: order.status, refund: null },
      after: {
        status: updated?.status,
        refund: refundRecord,
      },
    });

    return {
      ok: true,
      output: {
        orderId: order.id,
        refundedGrosze: refundAmount,
        stripeRefundId,
        newStatus: updated?.status,
      },
    };
  },
});
