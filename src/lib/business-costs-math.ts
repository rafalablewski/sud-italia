// Pure normalization helpers for the operating-costs ledger.
//
// Extracted from AdminBusinessCosts so server code (the LTV/CAC report's CAC
// numerator) and the client costs table share ONE definition of "what does
// this recurring cost amount to per month" — no drift between what the
// operator sees in /admin/business-costs and what the CAC math charges.

import type { BusinessCost, BusinessCostFrequency } from "@/data/types";

/** Conversion factors that normalize amountGrosze@frequency → grosze/month.
 *  one-off ⇒ 0 (it's not a recurring monthly burn; place it in its own month
 *  via the dated helpers instead). */
export const FREQUENCY_TO_MONTHS: Record<BusinessCostFrequency, number> = {
  "one-off": 0,
  daily: 30.4375,
  weekly: 4.345,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Convert any recurring cost to a monthly grosze figure. One-off ⇒ 0. */
export function monthlyGrosze(c: Pick<BusinessCost, "amountGrosze" | "frequency">): number {
  return Math.round(c.amountGrosze * FREQUENCY_TO_MONTHS[c.frequency]);
}
