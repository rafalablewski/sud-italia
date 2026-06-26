import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import type { AdminRole } from "@/lib/admin-roles";
import {
  getSettings,
  getPaymentSettings,
  getQrOrderingSettings,
  getIntegrationSettings,
  getUpsellSettings,
  getLoyaltySettings,
} from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// A flat, display-only projection of a settings object. These objects hold NO
// secrets (Stripe/WhatsApp/aggregator keys live in env vars — confirmed in the
// store), so a recursive flatten is safe and gives the operator app a faithful,
// read-only mirror of every web settings page through ONE endpoint + ONE screen.

interface Field { label: string; value: string }

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function flatten(input: unknown): Field[] {
  const out: Field[] = [];
  const walk = (val: unknown, path: string) => {
    if (val === null || val === undefined || val === "") return;
    if (Array.isArray(val)) {
      if (val.length === 0) return;
      if (val.every((v) => typeof v !== "object" || v === null)) {
        out.push({ label: path, value: val.join(", ") });
      } else {
        val.forEach((v, i) => walk(v, `${path} #${i + 1}`));
      }
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        walk(v, path ? `${path} · ${humanize(k)}` : humanize(k));
      }
    } else {
      out.push({ label: path, value: typeof val === "boolean" ? (val ? "On" : "Off") : String(val) });
    }
    if (out.length > 300) return; // safety cap
  };
  walk(input, "");
  return out.slice(0, 300);
}

const SURFACES: Record<string, { title: string; min: AdminRole; load: () => Promise<unknown> }> = {
  general: { title: "Settings", min: "owner", load: getSettings },
  payments: { title: "Payments", min: "manager", load: getPaymentSettings },
  qr: { title: "QR ordering", min: "manager", load: getQrOrderingSettings },
  integrations: { title: "Integrations", min: "manager", load: getIntegrationSettings },
  upsell: { title: "Upsell & cross-sell", min: "manager", load: getUpsellSettings },
  loyalty: { title: "Loyalty", min: "manager", load: getLoyaltySettings },
  currency: { title: "Currency", min: "owner", load: async () => (await getSettings()).currency ?? {} },
  languages: { title: "Languages", min: "owner", load: async () => (await getSettings()).locale ?? {} },
};

/**
 * `GET /api/v1/admin/settings?surface=` — a flat, read-only view of a settings
 * surface (general, payments, qr, integrations, upsell, loyalty, currency,
 * languages), mirroring the matching web `/admin/*` config pages. Role-gated
 * per surface.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("surface")?.trim() || "general";
  const surface = SURFACES[key];
  if (!surface) return apiError("not_found", `Unknown settings surface "${key}"`);

  const guard = requireRole(req, surface.min);
  if ("error" in guard) return guard.error;

  try {
    const data = await surface.load();
    return apiOk({ surface: key, title: surface.title, fields: flatten(data) });
  } catch (err) {
    logger.error("v1 admin settings failed", { layer: "api.v1.admin.settings" }, err as Error);
    return apiError("internal", "Could not load settings");
  }
}
