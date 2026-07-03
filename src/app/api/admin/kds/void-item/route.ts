import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { voidKitchenItem, appendAuditLog } from "@/lib/store";
import { getCurrentActor } from "@/lib/admin-auth";
import { parseBody } from "@/lib/api-schemas";
import { z } from "zod";

/**
 * KDS cancel-notify — a dish cancelled AFTER it fired. The POS calls this when
 * an operator voids a line that's already gone to the kitchen; it records the
 * cancellation on the order (`voidedItems`) so the kitchen display shows the
 * dish struck-through ("pulled") with a reason, never a silent disappearance.
 * Every void is audit-logged with the actor. Staff+, location-scoped.
 *
 * POST /api/admin/kds/void-item  { orderId, name, quantity?, reason? }
 */
const bodySchema = z.object({
  orderId: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(50).optional(),
  reason: z.string().max(60).optional(),
});

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req) => {
    const parsed = await parseBody(req, bodySchema);
    if ("error" in parsed) return parsed.error;
    const { orderId, name, quantity, reason } = parsed.data;

    const order = await voidKitchenItem(orderId, { name, quantity: quantity ?? 1, reason });
    if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

    await appendAuditLog({
      actor: await getCurrentActor(),
      action: "kds.void_item",
      entityType: "order",
      entityId: orderId,
      after: { name, quantity: quantity ?? 1, reason: reason ?? null, when: "after firing" },
    }).catch(() => {});

    return NextResponse.json({ ok: true, voidedItems: order.voidedItems ?? [] });
  },
);
