import { logger } from "@/lib/logger";

/**
 * SMS provider interface (m2_15). Customer-facing comms (order ready,
 * delivery on the way, refund issued) flow through this abstraction so a
 * single env switch flips us from "log only" to "live Twilio" without
 * changes to the outbox dispatcher or any caller.
 *
 * Phase 1 m1_13's outbox is the dispatch substrate; this interface is what
 * its handler eventually calls. Until Twilio creds land, the
 * NoopSmsProvider keeps the build green + leaves a structured log line so
 * an operator can grep "would have sent" against the audit trail.
 */

export interface SmsSendResult {
  /** Provider-issued message id, opaque to us. */
  id: string;
  /** Final status the provider returned. "queued"/"sent" — provider-specific. */
  status: string;
}

export interface SmsProvider {
  /**
   * Send an SMS to a PL E.164 phone. `body` is plain text (no MMS for now).
   * The implementation is responsible for honoring carrier length limits;
   * the templates in m2_16 stay under 160 chars to be safe.
   */
  send(to: string, body: string): Promise<SmsSendResult>;
  /** Symbolic name for telemetry / health endpoint. */
  readonly name: string;
}

class NoopSmsProvider implements SmsProvider {
  readonly name = "noop";
  async send(to: string, body: string): Promise<SmsSendResult> {
    // Visible in admin/health logs so it's obvious when prod is missing creds.
    logger.info("sms.send.noop", {
      provider: "noop",
      to,
      bodyLength: body.length,
      // Don't log the body verbatim — sensitive (loyalty codes, etc).
      bodyPreview: body.slice(0, 60),
      layer: "providers.sms",
    });
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
}

/**
 * Twilio HTTP API client (m2_15). Uses the basic-auth REST endpoint —
 * no SDK dependency, no Node-version requirements, runs on Vercel edge
 * if we ever move the dispatcher there. Activated by setting
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM in env.
 */
class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const form = new URLSearchParams({ To: to, From: this.from, Body: body });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Twilio send failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as { sid: string; status?: string };
    return { id: json.sid, status: json.status ?? "queued" };
  }
}

let cached: SmsProvider | undefined;

/**
 * Picks the provider from env. Twilio when all three vars are set;
 * Noop otherwise. Cached per process because the choice doesn't shift
 * mid-runtime.
 */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  if (sid && token && from) {
    cached = new TwilioSmsProvider(sid, token, from);
  } else {
    cached = new NoopSmsProvider();
  }
  return cached;
}

/** Test-only override. */
export function _setSmsProviderForTests(provider: SmsProvider): void {
  cached = provider;
}
