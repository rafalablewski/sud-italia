import { logger } from "@/lib/logger";

/**
 * Email provider interface (m2_15). Mirrors lib/providers/sms.ts. Receipts
 * (m2_18), feedback requests, refund notices all flow through this. Until
 * Mailgun creds land, NoopEmailProvider keeps the build green + leaves a
 * structured log line.
 */

export interface EmailSendResult {
  id: string;
  status: string;
}

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  /** Plain-text body. Most receipts work fine without HTML. */
  text: string;
  /** Optional HTML body. When present, providers send a multipart message. */
  html?: string;
  /** Optional Reply-To header (e.g. "support@ottaviano.pl"). */
  replyTo?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
  readonly name: string;
}

class NoopEmailProvider implements EmailProvider {
  readonly name = "noop";
  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info("email.send.noop", {
      provider: "noop",
      to: message.to,
      subject: message.subject,
      bodyLength: message.text.length,
      layer: "providers.email",
    });
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
}

/**
 * Mailgun HTTP API client. Activated by MAILGUN_API_KEY + MAILGUN_DOMAIN +
 * MAILGUN_FROM. Uses the EU endpoint when MAILGUN_REGION=eu (matches
 * GDPR / Polish data-residency preferences).
 */
class MailgunEmailProvider implements EmailProvider {
  readonly name = "mailgun";
  constructor(
    private readonly apiKey: string,
    private readonly domain: string,
    private readonly from: string,
    private readonly region: "us" | "eu" = "us",
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const base = this.region === "eu"
      ? `https://api.eu.mailgun.net/v3/${this.domain}/messages`
      : `https://api.mailgun.net/v3/${this.domain}/messages`;
    const auth = Buffer.from(`api:${this.apiKey}`).toString("base64");
    const form = new URLSearchParams();
    form.set("from", message.from ?? this.from);
    form.set("to", message.to);
    form.set("subject", message.subject);
    form.set("text", message.text);
    if (message.html) form.set("html", message.html);
    if (message.replyTo) form.set("h:Reply-To", message.replyTo);
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Mailgun send failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as { id?: string; message?: string };
    return { id: json.id ?? "unknown", status: json.message ?? "Queued" };
  }
}

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const apiKey = process.env.MAILGUN_API_KEY?.trim();
  const domain = process.env.MAILGUN_DOMAIN?.trim();
  const from = process.env.MAILGUN_FROM?.trim();
  if (apiKey && domain && from) {
    const region = process.env.MAILGUN_REGION?.trim() === "eu" ? "eu" : "us";
    cached = new MailgunEmailProvider(apiKey, domain, from, region);
  } else {
    cached = new NoopEmailProvider();
  }
  return cached;
}

export function _setEmailProviderForTests(provider: EmailProvider): void {
  cached = provider;
}
