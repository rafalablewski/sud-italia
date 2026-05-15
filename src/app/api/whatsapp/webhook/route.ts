import { NextRequest, NextResponse } from "next/server";
import { claimWebhookEvent } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { verifyHubChallenge, verifyMetaSignature } from "@/lib/whatsapp/verify";
import { extractInboundMessages, type MetaWebhookPayload } from "@/lib/whatsapp/inbound";
import { handleInboundTurn } from "@/lib/whatsapp/turn";
import { getWhatsAppProvider } from "@/lib/providers/whatsapp";
import {
  appendWaMessage,
  getCustomer,
  getWaSession,
  getWaSettings,
} from "@/lib/store";
import { incrCounter } from "@/lib/metrics";

/**
 * Meta WhatsApp Cloud API webhook. Two methods on the same path:
 *
 *  - GET: one-shot subscription handshake. Meta calls this when an
 *    operator adds the webhook URL in the Developer Console; we echo
 *    the challenge string only when the verify_token matches what's
 *    in env. Wrong token → 403, no echo.
 *
 *  - POST: incoming customer message (or status update, which we
 *    ignore). Body is signed with X-Hub-Signature-256 against the
 *    app secret over the raw bytes. Always 200 OK to Meta — Meta
 *    retries aggressively on non-2xx within ~20s, which burns the
 *    24h messaging window. Errors are swallowed + logged.
 */

export async function GET(req: NextRequest) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "";
  const challenge = verifyHubChallenge(req.nextUrl.searchParams, expected);
  if (challenge === null) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || "";
  const rawBody = await req.text();

  if (!appSecret) {
    logger.error("whatsapp.webhook.no_secret", { route: "POST /api/whatsapp/webhook" });
    // Without an app secret we can't trust the body; refuse silently so
    // misconfigured deployments don't silently process random POSTs.
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    incrCounter("whatsapp.webhook.signature_fail");
    logger.warn("whatsapp.webhook.signature_fail", { route: "POST /api/whatsapp/webhook" });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const messages = extractInboundMessages(payload);
  // Process each message in sequence (Meta only sends one or two per
  // payload in practice). Always return 200 even when individual
  // messages error out — Meta should not retry on our application bug.
  for (const message of messages) {
    try {
      await processOne(message);
    } catch (err) {
      logger.error(
        "whatsapp.inbound.error",
        {
          route: "POST /api/whatsapp/webhook",
          messageId: message.id,
          kind: message.kind,
        },
        err,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function processOne(message: {
  id: string;
  from: string;
  kind: "text" | "selection" | "location" | "unsupported";
  value: string;
  rawType: string;
  contactName: string | null;
  timestamp: string;
}) {
  // Idempotency: Meta retries every message id on any non-2xx + on long
  // processing times. Even though we always 200, network blips can still
  // trigger duplicates, so dedupe at the message id.
  const claimed = await claimWebhookEvent("whatsapp", message.id, message.kind);
  if (!claimed) return;

  const phone = normalizePlPhoneE164(message.from);
  if (!phone) {
    // Non-PL number. We support Polish customers only for now — politely
    // reject in English + Polish.
    const provider = getWhatsAppProvider();
    await provider.sendText(
      message.from,
      "Hi! Sud Italia takes orders only from Polish numbers for now. Cześć!",
    );
    return;
  }

  // Persist the inbound to the transcript before any further branching
  // — opt-outs, errors, and welcome flows all leave a trace.
  await appendWaMessage(phone, {
    at: message.timestamp,
    direction: "in",
    kind: message.kind,
    body: message.value,
    meta: {
      messageId: message.id,
      rawType: message.rawType,
      contactName: message.contactName,
    },
    actor: "customer",
  });

  const settings = await getWaSettings();

  // Opt-out gate. Honour the existing customer.smsOptout flag — one
  // opt-out preference covers all customer-facing channels — and any
  // configured opt-out keyword in the message body.
  if (message.kind === "text") {
    const upper = message.value.trim().toUpperCase();
    if (settings.optOutPhrases.map((p) => p.toUpperCase()).includes(upper)) {
      const provider = getWhatsAppProvider();
      await provider.sendText(
        phone,
        "OK — wyciszamy powiadomienia. Zawsze możesz wrócić, pisząc do nas ponownie. 🍕",
      );
      // We don't have a write path to flip smsOptout directly here without
      // a customer row; the next order will recompute the rollup. For now
      // log it so the operator can manually toggle in /admin/customers.
      logger.info("whatsapp.optout.requested", { phone, layer: "whatsapp.webhook" });
      return;
    }
  }

  const customer = await getCustomer(phone);
  if (customer?.smsOptout) {
    // Customer asked to be left alone — don't reply.
    incrCounter("whatsapp.optout.skipped");
    return;
  }

  // First-touch welcome: when this is the customer's very first message
  // (no active session yet) deliver the welcome blurb before handing
  // off to the LLM. Keeps cold-start UX warm even when the model is
  // momentarily slow. Read-only — the turn handler does the actual
  // session write.
  const sessionBefore = await getWaSession(phone);
  if (!sessionBefore || sessionBefore.llmMessageHistory.length === 0) {
    const provider = getWhatsAppProvider();
    await provider.sendText(phone, settings.welcomeMessage);
  }

  await handleInboundTurn({ message: { ...message, from: phone }, phone });
}
