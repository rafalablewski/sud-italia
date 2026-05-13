import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import { parseBody, phoneInput } from "@/lib/api-schemas";
import { appendAuditLog, getCustomer } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getSmsProvider } from "@/lib/providers/sms";
import { getEmailProvider } from "@/lib/providers/email";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Ad-hoc operator-initiated message to a customer (m2_20). Used by the
 * "Send SMS / Send Email" buttons on the customer detail page. Manager+
 * only — kitchen and staff don't get to blast customers ad-hoc; reserved
 * for refund follow-ups, comp offers, and one-off apologies.
 *
 * Rate-limited per customer-phone (3/hour) so even with a compromised
 * admin session we cap collateral damage. The standard customer
 * opt-out flags (sms_optout / email_optout) are honored exactly like
 * the automated path.
 *
 * Every send writes an audit log row tagged "comms.manual_send" so the
 * activity surfaces in the Phase 3 m3_16 audit UI.
 */
const sendBodySchema = z
  .object({
    channel: z.enum(["sms", "email"]),
    body: z.string().min(1).max(2000),
    /** Optional subject — required when channel === "email". */
    subject: z.string().min(1).max(200).optional(),
  })
  .refine(
    (data) => data.channel !== "email" || (typeof data.subject === "string" && data.subject.length > 0),
    {
      message: "subject is required when channel is 'email'",
      path: ["subject"],
    },
  );

const paramsSchema = z.object({ phone: phoneInput });

export const POST = withAdmin<{ params: Promise<{ phone: string }> }>(
  { roles: ["manager", "owner"] },
  async (req, { params }, { user }) => {
    const { phone: rawPhone } = await params;
    const decodedPhone = decodeURIComponent(rawPhone);
    const phoneParsed = paramsSchema.safeParse({ phone: decodedPhone });
    if (!phoneParsed.success) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const phone = normalizePlPhoneE164(phoneParsed.data.phone) ?? phoneParsed.data.phone;

    // 3/hr/customer keeps a compromised admin session from blasting the
    // same customer repeatedly. The shared session-level rate limiter
    // (m0_11) caps total volume across customers separately.
    const rl = await enforceRateLimit({
      key: "admin-send",
      id: phone,
      limit: 3,
      windowSec: 3600,
    });
    if (rl) return rl;

    const parsed = await parseBody(req, sendBodySchema);
    if ("error" in parsed) return parsed.error;
    const { channel, body, subject } = parsed.data;

    const customer = await getCustomer(phone);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Honor opt-outs exactly like the automated comms dispatcher. An
    // explicit override flag could ride on top later (operator chooses to
    // breach opt-out for a refund notice, for example) but Phase 2 keeps
    // the default safe.
    if (channel === "sms" && customer.smsOptout) {
      return NextResponse.json(
        { error: "Customer has opted out of SMS" },
        { status: 409 },
      );
    }
    if (channel === "email") {
      if (!customer.email) {
        return NextResponse.json(
          { error: "Customer has no email on file" },
          { status: 409 },
        );
      }
      if (customer.emailOptout) {
        return NextResponse.json(
          { error: "Customer has opted out of email" },
          { status: 409 },
        );
      }
    }

    try {
      if (channel === "sms") {
        const result = await getSmsProvider().send(phone, body);
        await appendAuditLog({
          actor: user.email || user.id,
          action: "comms.manual_send",
          entityType: "customer",
          entityId: phone,
          after: { channel, providerMessageId: result.id, bodyLength: body.length },
        });
        return NextResponse.json({ ok: true, channel, providerMessageId: result.id });
      }
      // email
      const result = await getEmailProvider().send({
        to: customer.email!,
        subject: subject!,
        text: body,
      });
      await appendAuditLog({
        actor: user.email || user.id,
        action: "comms.manual_send",
        entityType: "customer",
        entityId: phone,
        after: { channel, providerMessageId: result.id, subject, bodyLength: body.length },
      });
      return NextResponse.json({ ok: true, channel, providerMessageId: result.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  },
);
