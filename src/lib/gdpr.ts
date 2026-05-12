import {
  gdprRedactFeedback,
  gdprRedactOrders,
  gdprRemoveCustomerNotes,
  gdprRemoveLoyaltyMember,
  getCustomerNotes,
  getFeedback,
  getLoyaltyMember,
  getOrders,
  type FeedbackEntry,
} from "@/lib/store";
import { phonesEqualPl, normalizePlPhoneE164 } from "@/lib/phone";
import type { CustomerNote, Order } from "@/data/types";

/**
 * GDPR Data Subject Access Request (DSAR) + erasure support.
 *
 * Polish UODO + EU GDPR Articles 15 (access) + 17 (erasure) require any
 * service that holds personal data to fulfil these requests at no cost
 * and within ~30 days. The customer is phone-keyed here, so both
 * operations are phone-driven.
 *
 * Erasure strategy: redact identity fields from orders + feedback (so
 * accounting / JPK figures stay intact) and physically remove customer
 * notes + the loyalty-member row. A tombstone phone is derived from a
 * deterministic hash so all of one customer's records still group
 * together after redaction without revealing the original number.
 */

const REDACT_PHONE_PREFIX = "+48000";

export interface GdprExport {
  phone: string;
  exportedAt: string;
  loyaltyMember: unknown;
  orders: Order[];
  customerNotes: CustomerNote[];
  feedback: FeedbackEntry[];
}

export async function exportCustomerData(phone: string): Promise<GdprExport> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const [allOrders, member, notes, feedback] = await Promise.all([
    getOrders(),
    getLoyaltyMember(canonical),
    getCustomerNotes(canonical),
    getFeedback(),
  ]);
  return {
    phone: canonical,
    exportedAt: new Date().toISOString(),
    loyaltyMember: member ?? null,
    orders: allOrders.filter((o) => phonesEqualPl(o.customerPhone, canonical)),
    customerNotes: notes,
    feedback: feedback.filter((f) => phonesEqualPl(f.customerPhone, canonical)),
  };
}

export interface GdprDeleteResult {
  phone: string;
  redactedOrders: number;
  removedNotes: number;
  removedLoyaltyMember: boolean;
  redactedFeedback: number;
  tombstone: string;
  deletedAt: string;
}

export async function deleteCustomerData(phone: string): Promise<GdprDeleteResult> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  const tombstone = `${REDACT_PHONE_PREFIX}${Math.abs(hashCode(canonical)) % 100000}`
    .padEnd(12, "0")
    .slice(0, 12);

  const [redactedOrders, removedNotes, removedLoyaltyMember, redactedFeedback] = await Promise.all([
    gdprRedactOrders(canonical, tombstone),
    gdprRemoveCustomerNotes(canonical),
    gdprRemoveLoyaltyMember(canonical),
    gdprRedactFeedback(canonical, tombstone),
  ]);

  return {
    phone: canonical,
    redactedOrders,
    removedNotes,
    removedLoyaltyMember,
    redactedFeedback,
    tombstone,
    deletedAt: new Date().toISOString(),
  };
}

/** Deterministic small hash so re-running erasure for the same phone
 *  produces the same tombstone. Not a security primitive. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
