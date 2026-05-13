import { getSmsProvider } from "@/lib/providers/sms";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getCustomers } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * draft_sms — read-only. The agent uses this to compose a message
 * the operator reviews before sending. Returns the rendered body and
 * a character count so the model can self-edit if it goes over the
 * 160-char single-segment limit.
 */
registerTool<{ phone: string; bodyDraft: string; reason?: string }>({
  name: "draft_sms",
  description:
    "Compose an SMS draft to a customer. Does not send. Returns the rendered " +
    "body + length so the operator can edit before approving.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      phone: { type: "string", description: "Customer phone (PL local or E.164)." },
      bodyDraft: { type: "string", description: "Proposed message text (max 320 chars)." },
      reason: { type: "string", description: "Operator-visible rationale." },
    },
    required: ["phone", "bodyDraft"],
  },
  async execute(input) {
    if (input.bodyDraft.length > 320) {
      return { ok: false, error: "SMS draft exceeds 320 chars" };
    }
    const normalized = normalizePlPhoneE164(input.phone);
    if (!normalized) return { ok: false, error: "Invalid phone number" };
    const segments = Math.ceil(input.bodyDraft.length / 160);
    return {
      ok: true,
      output: {
        toE164: normalized,
        body: input.bodyDraft,
        length: input.bodyDraft.length,
        segments,
        reason: input.reason,
      },
    };
  },
});

/**
 * send_sms — manager+. Sends via the configured provider (Twilio when
 * env is set, noop otherwise). Honors customers.smsOptout — opted-out
 * customers cannot be messaged regardless of operator role.
 */
registerTool<{ phone: string; body: string; reason?: string }>({
  name: "send_sms",
  description:
    "Send an SMS to a customer immediately. Manager+. Respects customer SMS opt-out.",
  minRole: "manager",
  mutates: true,
  inputSchema: {
    type: "object" as const,
    properties: {
      phone: { type: "string", description: "Customer phone (PL local or E.164)." },
      body: { type: "string", description: "Message body (max 320 chars)." },
      reason: { type: "string", description: "Why the message is being sent (for audit)." },
    },
    required: ["phone", "body"],
  },
  async execute(input, ctx) {
    if (input.body.length > 320) {
      return { ok: false, error: "SMS body exceeds 320 chars" };
    }
    const normalized = normalizePlPhoneE164(input.phone);
    if (!normalized) return { ok: false, error: "Invalid phone number" };

    const customers = await getCustomers();
    const customer = customers.find((c) => c.phone === normalized);
    if (customer?.smsOptout) {
      return { ok: false, error: "Customer has opted out of SMS" };
    }

    if (ctx.dryRun) {
      return {
        ok: true,
        preview: `Send SMS to ${normalized}: "${input.body}"`,
      };
    }

    const provider = getSmsProvider();
    const result = await provider.send(normalized, input.body);
    return {
      ok: true,
      output: { provider: provider.name, to: normalized, providerId: result.id, status: result.status },
    };
  },
});
