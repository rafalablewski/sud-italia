import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { appendAuditLog, getOrderById, updateOrder } from "@/lib/store";
import {
  REFUND_REASON_CODES,
  type OrderRefund,
  type RefundReasonCode,
} from "@/data/types";

interface RefundBody {
  type?: "full" | "partial";
  amount?: number;
  reasonCode?: RefundReasonCode;
  notes?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  let body: RefundBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, amount, reasonCode, notes } = body;

  if (type !== "full" && type !== "partial") {
    return NextResponse.json(
      { error: "type must be 'full' or 'partial'" },
      { status: 400 },
    );
  }

  if (!reasonCode || !REFUND_REASON_CODES.includes(reasonCode)) {
    return NextResponse.json(
      { error: "Invalid or missing reasonCode" },
      { status: 400 },
    );
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.refund) {
    return NextResponse.json(
      { error: "Order already refunded" },
      { status: 409 },
    );
  }

  // Determine the refund amount.
  const refundAmount =
    type === "full"
      ? order.totalAmount
      : Number.isInteger(amount) && (amount as number) > 0
        ? (amount as number)
        : NaN;

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return NextResponse.json(
      { error: "Partial refunds require a positive integer amount (grosze)" },
      { status: 400 },
    );
  }

  if (refundAmount > order.totalAmount) {
    return NextResponse.json(
      { error: "Refund amount exceeds order total" },
      { status: 400 },
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
      console.error("Stripe refund failed:", err);
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
    refundedBy: "admin",
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
    actor: "admin",
    action: type === "full" ? "orders.refund_full" : "orders.refund_partial",
    entityType: "order",
    entityId: orderId,
    before: { totalAmount: order.totalAmount, status: order.status },
    after: {
      refundAmount,
      reasonCode,
      stripeRefundId: stripeRefundId ?? null,
      newStatus: updated.status,
    },
  });

  return NextResponse.json(updated);
}
