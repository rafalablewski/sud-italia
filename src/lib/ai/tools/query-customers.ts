import { getCustomers } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { registerTool } from "./registry";

/**
 * query_customers — phone lookup + recent-customer browse. Staff+. The
 * agent uses this to pull context before drafting a customer reply or
 * approving a comp.
 */
registerTool<{ phone?: string; nameSearch?: string; limit?: number }>({
  name: "query_customers",
  description:
    "Look up customers by phone (preferred) or partial name. Returns lifetime totals, " +
    "loyalty balance, opt-outs, and contact info. Read-only.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      phone: {
        type: "string",
        description: "E.164 or Polish-local phone number; preferred lookup key.",
      },
      nameSearch: {
        type: "string",
        description: "Case-insensitive partial name match. Ignored if `phone` is given.",
      },
      limit: {
        type: "number",
        description: "Max results for nameSearch (default 10, max 50).",
      },
    },
  },
  async execute(input) {
    const all = await getCustomers();

    if (input.phone) {
      const normalized = normalizePlPhoneE164(input.phone);
      const target = normalized ?? input.phone;
      const match = all.find((c) => c.phone === target);
      if (!match) {
        return { ok: true, output: { found: false, phoneSearched: target } };
      }
      return { ok: true, output: { found: true, customer: match } };
    }

    if (input.nameSearch) {
      const q = input.nameSearch.toLowerCase();
      const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
      const matches = all
        .filter((c) => (c.name ?? "").toLowerCase().includes(q))
        .slice(0, limit);
      return { ok: true, output: { count: matches.length, customers: matches } };
    }

    return { ok: false, error: "Provide `phone` or `nameSearch`." };
  },
});
