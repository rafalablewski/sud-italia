import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  addPointAdjustment,
  getCustomers,
  getOrders,
  getRetentionOutreach,
  recordRetentionOutreach,
} from "@/lib/store";
import { buildWinBackQueue, type RetentionConsent } from "@/lib/retention";

/**
 * Retention / Win-back — Phase 2 of the Customer Identity Network. The system
 * decides *who* is slipping, *what* incentive, *which* consented channel and
 * *the message*; the operator approves and it acts.
 *
 * GET  → the ranked win-back queue (built live from real orders + consent + the
 *        outreach log's cooldown). manager+.
 * POST → execute one win-back: grant the incentive points (real loyalty ledger
 *        adjustment) + log the outreach so the cooldown holds and it's audited.
 *        Auto-send on the consented channel is the next decay-to-autonomy step;
 *        v1 grants + drafts so it never depends on unconfigured providers.
 */

export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const [orders, customers, outreach] = await Promise.all([
    getOrders(),
    getCustomers(),
    getRetentionOutreach(),
  ]);

  const consentByPhone = new Map<string, RetentionConsent>(
    customers.map((c) => [
      c.phone,
      { name: c.name, email: c.email, smsOptout: c.smsOptout, emailOptout: c.emailOptout },
    ]),
  );

  const lastContactedByPhone = new Map<string, string>();
  for (const o of outreach) {
    const prev = lastContactedByPhone.get(o.phone);
    if (!prev || o.actedAt > prev) lastContactedByPhone.set(o.phone, o.actedAt);
  }

  const queue = buildWinBackQueue({ orders, consentByPhone, lastContactedByPhone });
  return NextResponse.json({ queue });
});

const ActionSchema = z.object({
  phone: z.string().min(3),
  bonusPoints: z.number().int().min(1).max(500),
  channel: z.enum(["sms", "email", "none"]),
  message: z.string().min(1).max(1000),
  risk: z.string().min(1).max(20),
  valueAtRiskGrosze: z.number().int().min(0).optional(),
});

export const POST = withAdmin({ roles: ["manager"] }, async (req, _ctx, { user }) => {
  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { phone, bonusPoints, channel, message, risk, valueAtRiskGrosze } = parsed.data;
  const actedBy = user.email || user.id;
  const actedAt = new Date().toISOString();

  // The "act": grant the incentive on the real loyalty ledger…
  await addPointAdjustment({
    phone,
    amount: bonusPoints,
    reason: "Win-back incentive (auto-retention)",
    adjustedBy: actedBy,
    adjustedAt: actedAt,
  });

  // …and log the outreach so the cooldown holds and it's audited.
  await recordRetentionOutreach({
    id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    phone,
    channel,
    bonusPoints,
    message,
    risk,
    valueAtRiskGrosze: valueAtRiskGrosze ?? 0,
    actedBy,
    actedAt,
  });

  return NextResponse.json({ ok: true, actedAt });
});
