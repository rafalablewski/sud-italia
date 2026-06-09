import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  addPointAdjustment,
  appendAuditLog,
  getCustomer,
  getCustomers,
  getOrders,
  getRetentionOutreach,
  recordRetentionOutreach,
  type CustomerRollup,
} from "@/lib/store";
import { getSmsProvider } from "@/lib/providers/sms";
import { getEmailProvider } from "@/lib/providers/email";
import {
  buildWinBackQueue,
  type OutreachChannel,
  type RetentionConsent,
  type WinBackQueue,
} from "@/lib/retention";

/**
 * Retention / Win-back — Phase 2 of the Customer Identity Network. The system
 * decides *who* is slipping, *what* incentive, *which* consented channel and
 * *the message*; the operator approves and it acts — granting the incentive on
 * the real loyalty ledger AND sending the message on the consented channel.
 *
 * GET  → the ranked win-back queue + which channels can actually deliver.
 * POST → execute. Two shapes:
 *          { phone, bonusPoints, channel, message, risk, valueAtRiskGrosze }
 *            — approve one card.
 *          { mode: "all" }
 *            — the decay-to-autonomy lever: run every reachable candidate
 *              server-side from the freshly-built queue, one click.
 *        Sends flow through getSmsProvider()/getEmailProvider(), which degrade
 *        to a logging no-op when no provider is configured — so this never
 *        depends on Twilio/Mailgun creds being present.
 */

const WINBACK_SUBJECT = "We miss you at Ottaviano 🍕";

interface DeliveryResult {
  sent: boolean;
  providerStatus: string;
  providerMessageId?: string;
  skippedReason?: string;
}

/** Send on the consented channel, honouring opt-outs; no-ops safely if unconfigured. */
async function deliver(
  channel: OutreachChannel,
  phone: string,
  message: string,
  customer: CustomerRollup | null,
): Promise<DeliveryResult> {
  if (channel === "sms") {
    if (customer?.smsOptout) return { sent: false, providerStatus: "skipped", skippedReason: "sms_optout" };
    const r = await getSmsProvider().send(phone, message);
    return { sent: r.status !== "noop", providerStatus: r.status, providerMessageId: r.id };
  }
  // email
  if (!customer?.email) return { sent: false, providerStatus: "skipped", skippedReason: "no_email" };
  if (customer.emailOptout) return { sent: false, providerStatus: "skipped", skippedReason: "email_optout" };
  const r = await getEmailProvider().send({ to: customer.email, subject: WINBACK_SUBJECT, text: message });
  return { sent: r.status !== "noop", providerStatus: r.status, providerMessageId: r.id };
}

interface WinBackAction {
  phone: string;
  bonusPoints: number;
  channel: OutreachChannel | "none";
  message: string;
  risk: string;
  valueAtRiskGrosze: number;
}

/** The action itself: grant the incentive, send (if a channel), log + audit. */
async function runWinBack(a: WinBackAction, actedBy: string): Promise<DeliveryResult & { phone: string }> {
  const actedAt = new Date().toISOString();

  await addPointAdjustment({
    phone: a.phone,
    amount: a.bonusPoints,
    reason: "Win-back incentive (auto-retention)",
    adjustedBy: actedBy,
    adjustedAt: actedAt,
  });

  let delivery: DeliveryResult = { sent: false, providerStatus: "none" };
  if (a.channel !== "none") {
    const customer = await getCustomer(a.phone);
    delivery = await deliver(a.channel, a.phone, a.message, customer);
  }

  await recordRetentionOutreach({
    id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    phone: a.phone,
    channel: a.channel,
    bonusPoints: a.bonusPoints,
    message: a.message,
    risk: a.risk,
    valueAtRiskGrosze: a.valueAtRiskGrosze,
    actedBy,
    actedAt,
    sent: delivery.sent,
    providerStatus: delivery.providerStatus,
    providerMessageId: delivery.providerMessageId,
  });

  await appendAuditLog({
    actor: actedBy,
    action: "comms.win_back",
    entityType: "customer",
    entityId: a.phone,
    after: {
      channel: a.channel,
      bonusPoints: a.bonusPoints,
      providerStatus: delivery.providerStatus,
      sent: delivery.sent,
      risk: a.risk,
    },
  });

  return { phone: a.phone, ...delivery };
}

/** Build the queue from live stores — shared by GET and the bulk "send all". */
async function loadQueue(): Promise<WinBackQueue> {
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

  return buildWinBackQueue({ orders, consentByPhone, lastContactedByPhone });
}

/** Which channels can actually deliver right now (vs log-only). */
function commsConfig(): { sms: boolean; email: boolean } {
  return { sms: getSmsProvider().name !== "noop", email: getEmailProvider().name !== "noop" };
}

export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const queue = await loadQueue();
  return NextResponse.json({ queue, comms: commsConfig() });
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
  const actedBy = user.email || user.id;

  // Bulk "send all reachable" — the decay-to-autonomy lever.
  if (body && typeof body === "object" && (body as { mode?: string }).mode === "all") {
    const queue = await loadQueue();
    const reachable = queue.candidates.filter((c) => c.channel !== null);
    let sent = 0;
    for (const c of reachable) {
      const r = await runWinBack(
        {
          phone: c.phone,
          bonusPoints: c.bonusPoints,
          channel: c.channel ?? "none",
          message: c.message,
          risk: c.risk,
          valueAtRiskGrosze: c.valueAtRiskGrosze,
        },
        actedBy,
      );
      if (r.sent) sent += 1;
    }
    return NextResponse.json({ ok: true, processed: reachable.length, sent });
  }

  // Single approve.
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const result = await runWinBack(
    { ...parsed.data, valueAtRiskGrosze: parsed.data.valueAtRiskGrosze ?? 0 },
    actedBy,
  );
  return NextResponse.json({ ok: true, sent: result.sent, providerStatus: result.providerStatus });
});
