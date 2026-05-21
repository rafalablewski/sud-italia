import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  DEFAULT_LOCALE_CONFIG,
  getSettings,
  updateSettings,
} from "@/lib/store";
import { parseBody } from "@/lib/api-schemas";

const localeEnum = z.enum(["pl", "en", "de", "en-SG"]);

const localeConfigSchema = z
  .object({
    defaultLocale: localeEnum,
    enabledLocales: z.array(localeEnum).min(1),
  })
  .refine((c) => c.enabledLocales.includes(c.defaultLocale), {
    message: "defaultLocale must be in enabledLocales",
    path: ["defaultLocale"],
  });

export const GET = withAdmin({}, async () => {
  const settings = await getSettings();
  return NextResponse.json(settings.locale ?? DEFAULT_LOCALE_CONFIG);
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, localeConfigSchema);
    if ("error" in parsed) return parsed.error;
    const before = (await getSettings()).locale;
    const after = await updateSettings({ locale: parsed.data });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "settings.locale.update",
      entityType: "settings",
      before,
      after: after.locale,
    });
    return NextResponse.json(after.locale);
  },
);
