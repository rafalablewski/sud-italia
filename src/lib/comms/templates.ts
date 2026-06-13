/**
 * Customer-facing message templates (m2_16). Each template is a function
 * of an event-specific payload that returns the SMS body and (where
 * applicable) the email subject + text body. The outbox dispatcher
 * (m2_17) calls these by event type.
 *
 * Localization: every template carries Polish (the chain's primary
 * market) and English variants. We pick PL by default and English only
 * when the customer record has an explicit `locale: "en"` (not modeled
 * yet — Phase 4 m4_17 customer segments will add it). For now, PL only.
 *
 * SMS keeps under 160 chars where possible to fit a single segment.
 */

import type { FulfillmentType } from "@/data/types";
import { SITE_NAME } from "@/lib/constants";

export type Locale = "pl" | "en";

const DEFAULT_LOCALE: Locale = "pl";

/** Operator trading name shown in every message. Templates take it on the
 *  payload (the dispatcher passes `getSettings().businessName`); the SITE_NAME
 *  constant is only the first-deploy fallback. */
type Branded = { brand?: string };

export interface OrderPlacedPayload {
  /** Trading name (operator-set); defaults to SITE_NAME. */
  brand?: string;
  orderId: string;
  customerName: string;
  /** PLN amount as a display string, e.g. "32.50". */
  totalDisplay: string;
  /** When the customer can pick up / receive delivery / sit down. "12:30" or "12:30–12:45". */
  slotDisplay?: string;
  fulfillmentType: FulfillmentType;
}

export interface OrderReadyPayload {
  /** Trading name (operator-set); defaults to SITE_NAME. */
  brand?: string;
  orderId: string;
  customerName: string;
  /** Drives the wording: delivery → "on the way", dine-in → "your table is
   *  ready", takeout → "ready for pickup". */
  fulfillmentType: FulfillmentType;
  locationName: string;
}

export interface OrderRefundedPayload {
  /** Trading name (operator-set); defaults to SITE_NAME. */
  brand?: string;
  orderId: string;
  customerName: string;
  /** "12.00 PLN" — pre-formatted. */
  amountDisplay: string;
  reasonLabel: string;
}

export interface OrderConfirmedReceipt {
  /** Trading name (operator-set); defaults to SITE_NAME. */
  brand?: string;
  orderId: string;
  customerName: string;
  totalDisplay: string;
  itemLines: { name: string; qty: number; lineTotal: string }[];
  pointsEarned: number;
  slotDisplay?: string;
  locationName: string;
  /** Optional referral link to include as a footer CTA. */
  referralUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A single rendered message ready for the provider. */
export interface RenderedSms {
  body: string;
}
export interface RenderedEmail {
  subject: string;
  text: string;
  html?: string;
}

// --- Templates: order placed --------------------------------------------

export function orderPlacedSms(
  p: OrderPlacedPayload,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `${p.brand ?? SITE_NAME}: thanks ${p.customerName}! Order ${p.orderId} (${p.totalDisplay} PLN) received. ${p.fulfillmentType === "delivery" ? "We'll text again when it's on the way." : p.slotDisplay ? `Ready at ${p.slotDisplay}.` : "We'll text when ready."}`,
    };
  }
  return {
    body: `${p.brand ?? SITE_NAME}: dziękujemy, ${p.customerName}! Zamówienie ${p.orderId} (${p.totalDisplay} PLN) przyjęte. ${p.fulfillmentType === "delivery" ? "Damy znać, gdy ruszy do Ciebie." : p.slotDisplay ? `Gotowe o ${p.slotDisplay}.` : "Damy znać, gdy będzie gotowe."}`,
  };
}

// --- Templates: order ready --------------------------------------------

export function orderReadySms(
  p: OrderReadyPayload,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body:
        p.fulfillmentType === "delivery"
          ? `${p.brand ?? SITE_NAME}: ${p.customerName}, your order ${p.orderId} is on the way!`
          : p.fulfillmentType === "dine-in"
            ? `${p.brand ?? SITE_NAME}: ${p.customerName}, your table at ${p.locationName} is ready and order ${p.orderId} is being served.`
            : `${p.brand ?? SITE_NAME}: ${p.customerName}, your order ${p.orderId} is ready for pickup at ${p.locationName}.`,
    };
  }
  return {
    body:
      p.fulfillmentType === "delivery"
        ? `${p.brand ?? SITE_NAME}: ${p.customerName}, zamówienie ${p.orderId} jest w drodze!`
        : p.fulfillmentType === "dine-in"
          ? `${p.brand ?? SITE_NAME}: ${p.customerName}, Twój stolik w ${p.locationName} jest gotowy, a zamówienie ${p.orderId} jest podawane.`
          : `${p.brand ?? SITE_NAME}: ${p.customerName}, zamówienie ${p.orderId} czeka do odbioru w ${p.locationName}.`,
  };
}

// --- Templates: order cancelled ----------------------------------------

export function orderCancelledSms(
  p: { orderId: string; customerName: string } & Branded,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `${p.brand ?? SITE_NAME}: ${p.customerName}, we had to cancel order ${p.orderId}. If you were charged, the refund is on the way. Sorry for the trouble.`,
    };
  }
  return {
    body: `${p.brand ?? SITE_NAME}: ${p.customerName}, musieliśmy anulować zamówienie ${p.orderId}. Jeśli było pobrane, zwrot w drodze. Przepraszamy.`,
  };
}

// --- Templates: refund issued ------------------------------------------

export function orderRefundedSms(
  p: OrderRefundedPayload,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `${p.brand ?? SITE_NAME}: ${p.customerName}, your refund of ${p.amountDisplay} for order ${p.orderId} is on the way. Reason: ${p.reasonLabel}.`,
    };
  }
  return {
    body: `${p.brand ?? SITE_NAME}: ${p.customerName}, zwrot ${p.amountDisplay} za zamówienie ${p.orderId} został zlecony. Powód: ${p.reasonLabel}.`,
  };
}

// --- Templates: paid-order receipt email -------------------------------

/**
 * Receipt email — plain text + HTML versions. HTML is a single-column
 * table layout that renders consistently across Gmail / iOS Mail / Outlook
 * without external CSS. Inline-style only, no external assets, no images
 * (avoids the "load remote images" prompt that hides the receipt).
 */
export function orderConfirmedReceiptEmail(
  p: OrderConfirmedReceipt,
  locale: Locale = DEFAULT_LOCALE,
): RenderedEmail {
  const isEnglish = locale === "en";
  const itemLinesText = p.itemLines
    .map((line) => `  ${line.qty}x ${line.name}  —  ${line.lineTotal} PLN`)
    .join("\n");

  const labels = isEnglish
    ? {
        subject: `${p.brand ?? SITE_NAME} receipt — order ${p.orderId}`,
        hi: `Hi ${p.customerName},`,
        thanks: `Thanks for your order at ${p.locationName}!`,
        orderL: "Order",
        readyAt: "Ready at",
        items: "Items",
        total: "Total",
        pointsEarned: "Loyalty points earned",
        footer:
          "A copy of this receipt is on your account. Reply to this email if anything's off.",
        sign: `— The ${p.brand ?? SITE_NAME} team`,
        referralCta: `Share ${p.brand ?? SITE_NAME}, earn points`,
      }
    : {
        subject: `Paragon ${p.brand ?? SITE_NAME} — zamówienie ${p.orderId}`,
        hi: `Cześć ${p.customerName},`,
        thanks: `Dziękujemy za zamówienie w ${p.locationName}!`,
        orderL: "Zamówienie",
        readyAt: "Gotowe o",
        items: "Pozycje",
        total: "Razem",
        pointsEarned: "Punkty zdobyte",
        footer:
          "Kopia paragonu jest na Twoim koncie. Odpowiedz na tę wiadomość, jeśli coś się nie zgadza.",
        sign: `— Zespół ${p.brand ?? SITE_NAME}`,
        referralCta: `Poleć ${p.brand ?? SITE_NAME}, zdobądź punkty`,
      };

  const text = `${labels.hi}

${labels.thanks}

${labels.orderL}: ${p.orderId}
${p.slotDisplay ? `${labels.readyAt}: ${p.slotDisplay}\n` : ""}
${labels.items}:
${itemLinesText}

${labels.total}: ${p.totalDisplay} PLN
${labels.pointsEarned}: ${p.pointsEarned}
${p.referralUrl ? `\n${labels.referralCta}: ${p.referralUrl}\n` : ""}
${labels.footer}

${labels.sign}`;

  const itemRowsHtml = p.itemLines
    .map(
      (line) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <span style="display:inline-block;width:28px;color:#666;">${escapeHtml(String(line.qty))}×</span>
          ${escapeHtml(line.name)}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">
          ${escapeHtml(line.lineTotal)} PLN
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${isEnglish ? "en" : "pl"}">
<head><meta charset="utf-8"><title>${escapeHtml(labels.subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f4;margin:0;padding:24px;color:#222;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
    <tr><td style="padding:24px 24px 0;">
      <h1 style="font-size:18px;margin:0 0 4px;color:#9A2742;">${escapeHtml(p.brand ?? SITE_NAME)}</h1>
      <p style="margin:0 0 20px;color:#666;font-size:13px;">${escapeHtml(p.locationName)}</p>
      <p style="margin:0 0 12px;">${escapeHtml(labels.hi)}</p>
      <p style="margin:0 0 16px;">${escapeHtml(labels.thanks)}</p>
    </td></tr>
    <tr><td style="padding:0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:#666;">${escapeHtml(labels.orderL)}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(p.orderId)}</td></tr>
        ${p.slotDisplay ? `<tr><td style="padding:4px 0;color:#666;">${escapeHtml(labels.readyAt)}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(p.slotDisplay)}</td></tr>` : ""}
      </table>
      <h2 style="font-size:14px;text-transform:uppercase;color:#666;letter-spacing:0.05em;margin:20px 0 4px;">${escapeHtml(labels.items)}</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">
        ${itemRowsHtml}
        <tr>
          <td style="padding:12px 0;font-weight:600;">${escapeHtml(labels.total)}</td>
          <td style="padding:12px 0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${escapeHtml(p.totalDisplay)} PLN</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;font-size:13px;">${escapeHtml(labels.pointsEarned)}</td>
          <td style="padding:4px 0;text-align:right;color:#666;font-size:13px;">+${p.pointsEarned}</td>
        </tr>
      </table>
    </td></tr>
    ${
      p.referralUrl
        ? `<tr><td style="padding:20px 24px;">
            <a href="${escapeHtml(p.referralUrl)}" style="display:inline-block;background:#9A2742;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:500;">
              ${escapeHtml(labels.referralCta)}
            </a>
          </td></tr>`
        : ""
    }
    <tr><td style="padding:20px 24px 24px;color:#666;font-size:13px;border-top:1px solid #eee;">
      <p style="margin:0 0 12px;">${escapeHtml(labels.footer)}</p>
      <p style="margin:0;">${escapeHtml(labels.sign)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: labels.subject, text, html };
}

// --- Templates: feedback request after delivery -------------------------

export function feedbackRequestSms(
  p: { orderId: string; customerName: string; feedbackUrl: string } & Branded,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `${p.brand ?? SITE_NAME}: ${p.customerName}, how was order ${p.orderId}? 30 seconds of feedback helps a lot: ${p.feedbackUrl}`,
    };
  }
  return {
    body: `${p.brand ?? SITE_NAME}: ${p.customerName}, jak było z zamówieniem ${p.orderId}? Wystarczy 30 sekund opinii: ${p.feedbackUrl}`,
  };
}
