import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  DEFAULT_CURRENCY_CONFIG,
  getSettings,
  updateSettings,
} from "@/lib/store";
import { parseBody } from "@/lib/api-schemas";

const currencyEnum = z.enum(["PLN", "USD", "SGD", "EUR", "AED"]);

const currencyConfigSchema = z.object({
  defaultCurrency: currencyEnum,
  enabledCurrencies: z.array(currencyEnum).min(1),
  rates: z
    .object({
      PLN: z.number().positive(),
      USD: z.number().positive(),
      SGD: z.number().positive(),
      EUR: z.number().positive(),
      AED: z.number().positive(),
    })
    .refine((r) => r.PLN === 1, {
      message: "PLN rate is fixed at 1 (source-of-truth currency).",
      path: ["PLN"],
    }),
});

export const GET = withAdmin({}, async () => {
  const settings = await getSettings();
  return NextResponse.json(settings.currency ?? DEFAULT_CURRENCY_CONFIG);
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, currencyConfigSchema);
    if ("error" in parsed) return parsed.error;
    // Force PLN into enabled list — disabling the source-of-truth charge
    // currency would leave checkout with no display option that matches
    // what Stripe debits.
    const enabledCurrencies = Array.from(
      new Set(["PLN" as const, ...parsed.data.enabledCurrencies]),
    );
    if (!enabledCurrencies.includes(parsed.data.defaultCurrency)) {
      return NextResponse.json(
        { error: "defaultCurrency must be in enabledCurrencies" },
        { status: 400 },
      );
    }
    const before = (await getSettings()).currency;
    const after = await updateSettings({
      currency: { ...parsed.data, enabledCurrencies },
    });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "settings.currency.update",
      entityType: "settings",
      before,
      after: after.currency,
    });
    return NextResponse.json(after.currency);
  },
);
