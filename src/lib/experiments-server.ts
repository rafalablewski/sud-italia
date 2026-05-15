import "server-only";
import { createHash } from "crypto";
import {
  type Experiment,
  type ResolvedVariant,
  buildResolvedVariant,
  pickVariantFromBucket,
} from "@/lib/experiments";
import { getUpsellSettings } from "@/lib/store";

/**
 * Server-side A/B variant resolver. Reads the location's upsell config
 * and hashes the customer's phone with Node's SHA-256 to pick the same
 * variant the client computed via Web Crypto SHA-256. Lives in its own
 * module (with `import "server-only"`) so `"use client"` components
 * can't accidentally pull the `fs`/`crypto`/store chain into the
 * browser bundle.
 */

function hashPhoneToBucket(experimentId: string, phoneE164: string): number {
  const h = createHash("sha256").update(`${experimentId}|${phoneE164}`).digest();
  const n = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
  return Math.abs(n) % 100;
}

export async function resolveCustomerVariant(
  locationSlug: string,
  phoneE164: string,
): Promise<ResolvedVariant | null> {
  const settings = await getUpsellSettings();
  const loc = settings[locationSlug] as { experiment?: Experiment | null } | undefined;
  const exp = loc?.experiment;
  if (!exp || !exp.active || exp.variants.length === 0) return null;

  const bucket = hashPhoneToBucket(exp.id, phoneE164) / 100;
  const picked = pickVariantFromBucket(exp, bucket);
  if (!picked) return null;
  return buildResolvedVariant(exp, picked);
}
