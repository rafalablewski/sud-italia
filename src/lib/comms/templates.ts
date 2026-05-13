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

export type Locale = "pl" | "en";

const DEFAULT_LOCALE: Locale = "pl";

export interface OrderPlacedPayload {
  orderId: string;
  customerName: string;
  /** PLN amount as a display string, e.g. "32.50". */
  totalDisplay: string;
  /** When the customer can pick up / receive delivery. "12:30" or "12:30–12:45". */
  slotDisplay?: string;
  fulfillmentType: "takeout" | "delivery";
}

export interface OrderReadyPayload {
  orderId: string;
  customerName: string;
  /** "pickup" | "delivery" — drives the wording. */
  fulfillmentType: "takeout" | "delivery";
  locationName: string;
}

export interface OrderRefundedPayload {
  orderId: string;
  customerName: string;
  /** "12.00 PLN" — pre-formatted. */
  amountDisplay: string;
  reasonLabel: string;
}

export interface OrderConfirmedReceipt {
  orderId: string;
  customerName: string;
  totalDisplay: string;
  itemLines: { name: string; qty: number; lineTotal: string }[];
  pointsEarned: number;
  slotDisplay?: string;
  locationName: string;
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
      body: `Sud Italia: thanks ${p.customerName}! Order ${p.orderId} (${p.totalDisplay} PLN) received. ${p.fulfillmentType === "delivery" ? "We'll text again when it's on the way." : p.slotDisplay ? `Ready at ${p.slotDisplay}.` : "We'll text when ready."}`,
    };
  }
  return {
    body: `Sud Italia: dziękujemy, ${p.customerName}! Zamówienie ${p.orderId} (${p.totalDisplay} PLN) przyjęte. ${p.fulfillmentType === "delivery" ? "Damy znać, gdy ruszy do Ciebie." : p.slotDisplay ? `Gotowe o ${p.slotDisplay}.` : "Damy znać, gdy będzie gotowe."}`,
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
          ? `Sud Italia: ${p.customerName}, your order ${p.orderId} is on the way!`
          : `Sud Italia: ${p.customerName}, your order ${p.orderId} is ready for pickup at ${p.locationName}.`,
    };
  }
  return {
    body:
      p.fulfillmentType === "delivery"
        ? `Sud Italia: ${p.customerName}, zamówienie ${p.orderId} jest w drodze!`
        : `Sud Italia: ${p.customerName}, zamówienie ${p.orderId} czeka do odbioru w ${p.locationName}.`,
  };
}

// --- Templates: order cancelled ----------------------------------------

export function orderCancelledSms(
  p: { orderId: string; customerName: string },
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `Sud Italia: ${p.customerName}, we had to cancel order ${p.orderId}. If you were charged, the refund is on the way. Sorry for the trouble.`,
    };
  }
  return {
    body: `Sud Italia: ${p.customerName}, musieliśmy anulować zamówienie ${p.orderId}. Jeśli było pobrane, zwrot w drodze. Przepraszamy.`,
  };
}

// --- Templates: refund issued ------------------------------------------

export function orderRefundedSms(
  p: OrderRefundedPayload,
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `Sud Italia: ${p.customerName}, your refund of ${p.amountDisplay} for order ${p.orderId} is on the way. Reason: ${p.reasonLabel}.`,
    };
  }
  return {
    body: `Sud Italia: ${p.customerName}, zwrot ${p.amountDisplay} za zamówienie ${p.orderId} został zlecony. Powód: ${p.reasonLabel}.`,
  };
}

// --- Templates: paid-order receipt email -------------------------------

export function orderConfirmedReceiptEmail(
  p: OrderConfirmedReceipt,
  locale: Locale = DEFAULT_LOCALE,
): RenderedEmail {
  const isEnglish = locale === "en";
  const itemLines = p.itemLines
    .map((line) => `  ${line.qty}x ${line.name}  —  ${line.lineTotal} PLN`)
    .join("\n");

  if (isEnglish) {
    return {
      subject: `Sud Italia receipt — order ${p.orderId}`,
      text: `Hi ${p.customerName},

Thanks for your order at ${p.locationName}!

Order: ${p.orderId}
${p.slotDisplay ? `Ready at: ${p.slotDisplay}\n` : ""}
Items:
${itemLines}

Total: ${p.totalDisplay} PLN
Loyalty points earned: ${p.pointsEarned}

A copy of this receipt is on your account. Reply to this email if anything's off.

— The Sud Italia team`,
    };
  }
  return {
    subject: `Paragon Sud Italia — zamówienie ${p.orderId}`,
    text: `Cześć ${p.customerName},

Dziękujemy za zamówienie w ${p.locationName}!

Zamówienie: ${p.orderId}
${p.slotDisplay ? `Gotowe o: ${p.slotDisplay}\n` : ""}
Pozycje:
${itemLines}

Razem: ${p.totalDisplay} PLN
Punkty zdobyte: ${p.pointsEarned}

Kopia paragonu jest na Twoim koncie. Odpowiedz na tę wiadomość, jeśli coś się nie zgadza.

— Zespół Sud Italia`,
  };
}

// --- Templates: feedback request after delivery -------------------------

export function feedbackRequestSms(
  p: { orderId: string; customerName: string; feedbackUrl: string },
  locale: Locale = DEFAULT_LOCALE,
): RenderedSms {
  if (locale === "en") {
    return {
      body: `Sud Italia: ${p.customerName}, how was order ${p.orderId}? 30 seconds of feedback helps a lot: ${p.feedbackUrl}`,
    };
  }
  return {
    body: `Sud Italia: ${p.customerName}, jak było z zamówieniem ${p.orderId}? Wystarczy 30 sekund opinii: ${p.feedbackUrl}`,
  };
}
