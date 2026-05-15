/**
 * Normalizes the Meta WhatsApp Cloud webhook payload into the small
 * subset the bot actually cares about. Meta nests messages under
 * `entry[].changes[].value.messages[]` and ships a different shape per
 * message type (text vs button vs list reply vs location vs image …).
 * Mapping that here keeps the turn handler ignorant of the wire shape.
 */

export type InboundMessageKind =
  | "text"
  | "selection" // interactive list / button reply — `value` is the row/button id
  | "location"
  | "unsupported";

export interface InboundMessage {
  /** Meta-issued message id. Used for the read-receipt + outbox dedupe. */
  id: string;
  /** Sender phone — Meta sends national digits, the route handler normalizes. */
  from: string;
  /** Display name from the WhatsApp contact card, when present. */
  contactName: string | null;
  /** ISO timestamp of when Meta says the message was sent. */
  timestamp: string;
  kind: InboundMessageKind;
  /** Plain text body for text/selection; "<lat>,<lng>" for location; "<type>" for unsupported. */
  value: string;
  /** Raw message-type label (Meta's `type`) — useful for telemetry. */
  rawType: string;
}

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    list_reply?: { id?: string; title?: string };
    button_reply?: { id?: string; title?: string };
  };
  location?: { latitude?: number; longitude?: number };
}

interface MetaContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface MetaChangeValue {
  messages?: MetaMessage[];
  contacts?: MetaContact[];
  statuses?: unknown[];
}

interface MetaEntry {
  changes?: { value?: MetaChangeValue }[];
}

export interface MetaWebhookPayload {
  entry?: MetaEntry[];
}

/**
 * Pull message events out of the deeply-nested payload. Status events
 * (delivery receipts / read receipts) are ignored — they're useful for
 * deliverability monitoring but irrelevant to ordering.
 */
export function extractInboundMessages(payload: MetaWebhookPayload): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const nameByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }
      for (const m of value.messages) {
        if (!m.id || !m.from) continue;
        out.push(normalizeMessage(m, nameByWaId.get(m.from) ?? null));
      }
    }
  }
  return out;
}

function normalizeMessage(m: MetaMessage, contactName: string | null): InboundMessage {
  const base = {
    id: m.id!,
    from: m.from!,
    contactName,
    timestamp: m.timestamp
      ? new Date(Number.parseInt(m.timestamp, 10) * 1000).toISOString()
      : new Date().toISOString(),
    rawType: m.type ?? "unknown",
  };
  if (m.type === "text" && m.text?.body) {
    return { ...base, kind: "text", value: m.text.body };
  }
  if (m.type === "interactive" && m.interactive) {
    const reply = m.interactive.list_reply ?? m.interactive.button_reply;
    if (reply?.id) {
      return { ...base, kind: "selection", value: reply.id };
    }
  }
  if (m.type === "location" && m.location) {
    const { latitude, longitude } = m.location;
    if (typeof latitude === "number" && typeof longitude === "number") {
      return { ...base, kind: "location", value: `${latitude},${longitude}` };
    }
  }
  return { ...base, kind: "unsupported", value: m.type ?? "unknown" };
}
