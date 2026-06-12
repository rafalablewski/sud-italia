import { logger } from "@/lib/logger";
import { appendWaMessage, isSandboxActive, type WaMessageActor } from "@/lib/store";

/**
 * WhatsApp Cloud API provider. Talks directly to Meta's Graph API —
 * no Twilio in the path. Mirrors the SmsProvider shape so the outbox
 * dispatcher can switch on `channel` and pick the right transport.
 *
 * Falls back to a no-op when the env isn't wired (typical for local
 * dev). The noop logs a structured line so an operator grepping
 * "would have sent" can audit what the bot tried to do.
 */

export interface WhatsAppSendResult {
  id: string;
  status: string;
}

export interface WhatsAppButton {
  /** Internal reply-id surfaced back as `interactive.button_reply.id`. */
  id: string;
  /** Visible label (max 20 chars per Meta). */
  title: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppProvider {
  readonly name: string;
  sendText(to: string, body: string): Promise<WhatsAppSendResult>;
  sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: WhatsAppButton[],
  ): Promise<WhatsAppSendResult>;
  sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: WhatsAppListSection[],
  ): Promise<WhatsAppSendResult>;
  sendCtaUrl(
    to: string,
    bodyText: string,
    buttonLabel: string,
    url: string,
  ): Promise<WhatsAppSendResult>;
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
  ): Promise<WhatsAppSendResult>;
  markRead(messageId: string): Promise<void>;
}

class NoopWhatsAppProvider implements WhatsAppProvider {
  readonly name = "noop";
  private log(kind: string, to: string, preview: string) {
    logger.info("whatsapp.send.noop", {
      provider: "noop",
      kind,
      to,
      preview: preview.slice(0, 80),
      layer: "providers.whatsapp",
    });
  }
  async sendText(to: string, body: string) {
    this.log("text", to, body);
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
  async sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]) {
    this.log("buttons", to, `${bodyText} | [${buttons.map((b) => b.title).join("|")}]`);
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
  async sendInteractiveList(to: string, bodyText: string) {
    this.log("list", to, bodyText);
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
  async sendCtaUrl(to: string, bodyText: string, buttonLabel: string, url: string) {
    this.log("cta_url", to, `${bodyText} → ${buttonLabel} → ${url}`);
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
  async sendTemplate(to: string, templateName: string) {
    this.log("template", to, templateName);
    return { id: `noop-${Date.now().toString(36)}`, status: "noop" };
  }
  async markRead(messageId: string) {
    this.log("read", messageId, "");
  }
}

/**
 * Strip the `+` prefix — Meta's API expects the bare E.164 digits
 * (e.g. "48123456789" rather than "+48123456789").
 */
function metaPhone(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta-cloud";
  private readonly url: string;
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    apiVersion: string,
  ) {
    this.url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  private async post(body: unknown): Promise<WhatsAppSendResult> {
    // Sandbox mode pauses the business — never hit the Meta Graph API.
    if (await isSandboxActive()) return { id: "sandbox-suppressed", status: "skipped" };
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WhatsApp send failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as { messages?: { id: string }[] };
    const id = json.messages?.[0]?.id ?? "";
    return { id, status: "queued" };
  }

  async sendText(to: string, body: string) {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaPhone(to),
      type: "text",
      text: { body, preview_url: false },
    });
  }

  async sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]) {
    // Meta caps interactive button rows at 3.
    const trimmed = buttons.slice(0, 3).map((b) => ({
      type: "reply",
      reply: { id: b.id, title: b.title.slice(0, 20) },
    }));
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaPhone(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: { buttons: trimmed },
      },
    });
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: WhatsAppListSection[],
  ) {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaPhone(to),
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: sections.slice(0, 10).map((s) => ({
            title: s.title.slice(0, 24),
            rows: s.rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              description: r.description ? r.description.slice(0, 72) : undefined,
            })),
          })),
        },
      },
    });
  }

  async sendCtaUrl(to: string, bodyText: string, buttonLabel: string, url: string) {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaPhone(to),
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          name: "cta_url",
          parameters: { display_text: buttonLabel.slice(0, 20), url },
        },
      },
    });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
  ) {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaPhone(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  async markRead(messageId: string) {
    try {
      await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      });
    } catch (err) {
      // Read receipts are best-effort; never fail an inbound turn over this.
      logger.warn("whatsapp.markRead.failed", { messageId, layer: "providers.whatsapp" }, err);
    }
  }
}

/**
 * Decorator that records every outbound send to the per-phone transcript
 * log in the kv_store. Wraps any concrete WhatsAppProvider so the logging
 * concern stays orthogonal to the transport — flip Meta → Twilio later
 * and the audit trail keeps working unchanged.
 *
 * `actor` defaults to "bot" since the vast majority of sends come from
 * the LLM-driven turn loop or the comms dispatcher. Admin-initiated
 * sends override this when calling — see the admin reply route.
 */
class LoggingWhatsAppProvider implements WhatsAppProvider {
  readonly name: string;
  constructor(
    private readonly inner: WhatsAppProvider,
    private readonly defaultActor: WaMessageActor = "bot",
  ) {
    this.name = `logging(${inner.name})`;
  }

  private log(
    to: string,
    kind: import("@/lib/store").WaMessageKind,
    body: string,
    meta?: Record<string, unknown>,
  ): void {
    void appendWaMessage(to, {
      at: new Date().toISOString(),
      direction: "out",
      kind,
      body,
      meta,
      actor: this.defaultActor,
    });
  }

  async sendText(to: string, body: string) {
    const result = await this.inner.sendText(to, body);
    this.log(to, "text", body, { messageId: result.id });
    return result;
  }

  async sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]) {
    const result = await this.inner.sendInteractiveButtons(to, bodyText, buttons);
    this.log(to, "buttons", bodyText, {
      messageId: result.id,
      buttons: buttons.map((b) => ({ id: b.id, title: b.title })),
    });
    return result;
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: WhatsAppListSection[],
  ) {
    const result = await this.inner.sendInteractiveList(to, bodyText, buttonLabel, sections);
    this.log(to, "list", bodyText, {
      messageId: result.id,
      buttonLabel,
      rowCount: sections.reduce((s, sec) => s + sec.rows.length, 0),
    });
    return result;
  }

  async sendCtaUrl(to: string, bodyText: string, buttonLabel: string, url: string) {
    const result = await this.inner.sendCtaUrl(to, bodyText, buttonLabel, url);
    this.log(to, "cta_url", bodyText, { messageId: result.id, buttonLabel, url });
    return result;
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
  ) {
    const result = await this.inner.sendTemplate(to, templateName, languageCode, components);
    this.log(to, "template", `(template:${templateName})`, {
      messageId: result.id,
      templateName,
      languageCode,
    });
    return result;
  }

  async markRead(messageId: string) {
    await this.inner.markRead(messageId);
  }
}

let cached: WhatsAppProvider | undefined;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  const inner: WhatsAppProvider =
    phoneNumberId && accessToken
      ? new MetaCloudWhatsAppProvider(phoneNumberId, accessToken, apiVersion)
      : new NoopWhatsAppProvider();
  cached = new LoggingWhatsAppProvider(inner);
  return cached;
}

/**
 * Returns a transcript-logging provider tagged with the given actor.
 * Use this for admin-initiated sends so the transcript correctly
 * attributes the message to an operator rather than the bot.
 */
export function getWhatsAppProviderAs(actor: WaMessageActor): WhatsAppProvider {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  const inner: WhatsAppProvider =
    phoneNumberId && accessToken
      ? new MetaCloudWhatsAppProvider(phoneNumberId, accessToken, apiVersion)
      : new NoopWhatsAppProvider();
  return new LoggingWhatsAppProvider(inner, actor);
}

export function _setWhatsAppProviderForTests(provider: WhatsAppProvider): void {
  cached = provider;
}

export function whatsAppConfigured(): boolean {
  return getWhatsAppProvider().name !== "noop";
}
