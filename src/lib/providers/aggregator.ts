import { createHmac, timingSafeEqual } from "crypto";
import type { Order } from "@/data/types";
import { logger } from "@/lib/logger";

/**
 * Aggregator provider interface (m2_21). Wolt + Glovo are the priorities
 * for Polish operations; the interface is provider-agnostic so a future
 * Uber Eats / Pyszne.pl integration plugs in without changing the
 * routing code in m2_22.
 *
 * All aggregator work is gated by ENABLE_AGGREGATORS=true on env so the
 * code can land without surfacing the integration to customers.
 *
 * No real merchant credentials are wired today — both providers expose
 * the same interface but the live implementations live behind env vars
 * (e.g. WOLT_API_KEY, GLOVO_API_KEY, *_WEBHOOK_SECRET). Until those
 * land we use the mock providers below for local dev + staging.
 */

export type AggregatorName = "wolt" | "glovo";

/** Webhook payload from the aggregator, normalized to a partial Order. */
export interface IngestedOrder
  extends Pick<
    Order,
    | "id"
    | "locationSlug"
    | "customerName"
    | "customerPhone"
    | "fulfillmentType"
    | "totalAmount"
    | "deliveryAddress"
    | "items"
  > {
  /** Provider name — written to `payload.source` on the order. */
  source: AggregatorName;
  /** Provider's own order id so status push-back targets the right row. */
  externalOrderId: string;
}

export interface MenuSyncItem {
  id: string;
  name: string;
  description?: string;
  priceGrosze: number;
  category: string;
  available: boolean;
}

export interface AggregatorProvider {
  readonly name: AggregatorName;

  /** Push the full menu (replace, not patch) to the aggregator. */
  syncMenu(items: MenuSyncItem[]): Promise<void>;

  /**
   * Map an inbound webhook payload to our normalized Order shape. The
   * webhook route (m2_22) authenticates the request first, then calls
   * this; if the payload is malformed the implementation should throw
   * so the webhook returns 400.
   */
  ingestOrder(rawPayload: unknown): Promise<IngestedOrder>;

  /**
   * Push an internal status change to the aggregator. They each have
   * their own status enum — implementations translate from our enum to
   * theirs and POST.
   */
  updateStatus(externalOrderId: string, status: Order["status"]): Promise<void>;

  /**
   * Verify the webhook signature. Most providers HMAC the request body
   * with a shared secret; we precompute the expected digest and
   * timing-safe-compare. Returns false on missing headers — the route
   * returns 401 in that case.
   */
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean;
}

/**
 * Shared HMAC-SHA256 verifier — both Wolt and Glovo use this pattern;
 * the header name differs.
 */
function verifyHmacSignature(
  rawBody: string,
  headerValue: string | null,
  secret: string,
): boolean {
  if (!headerValue) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (headerValue.length !== expected.length) return false;
    return timingSafeEqual(
      Buffer.from(headerValue, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// --- Mock providers ------------------------------------------------------

class WoltMockProvider implements AggregatorProvider {
  readonly name: AggregatorName = "wolt";
  async syncMenu(items: MenuSyncItem[]): Promise<void> {
    logger.info("aggregator.syncMenu.mock", {
      provider: "wolt",
      itemCount: items.length,
      layer: "providers.aggregator",
    });
  }
  async ingestOrder(raw: unknown): Promise<IngestedOrder> {
    // Trust the test harness to pass our own shape through. Real Wolt
    // payload mapping ships when credentials land.
    return raw as IngestedOrder;
  }
  async updateStatus(externalOrderId: string, status: Order["status"]): Promise<void> {
    logger.info("aggregator.updateStatus.mock", {
      provider: "wolt",
      externalOrderId,
      status,
      layer: "providers.aggregator",
    });
  }
  verifyWebhookSignature(): boolean {
    // Mock provider always accepts — staging only.
    return true;
  }
}

class GlovoMockProvider implements AggregatorProvider {
  readonly name: AggregatorName = "glovo";
  async syncMenu(items: MenuSyncItem[]): Promise<void> {
    logger.info("aggregator.syncMenu.mock", {
      provider: "glovo",
      itemCount: items.length,
      layer: "providers.aggregator",
    });
  }
  async ingestOrder(raw: unknown): Promise<IngestedOrder> {
    return raw as IngestedOrder;
  }
  async updateStatus(externalOrderId: string, status: Order["status"]): Promise<void> {
    logger.info("aggregator.updateStatus.mock", {
      provider: "glovo",
      externalOrderId,
      status,
      layer: "providers.aggregator",
    });
  }
  verifyWebhookSignature(): boolean {
    return true;
  }
}

// --- Live providers (scaffolding) ----------------------------------------

/**
 * Real Wolt provider scaffold — populated when WOLT_API_KEY +
 * WOLT_WEBHOOK_SECRET land. The interface is wired so a future commit
 * implements the bodies without touching m2_22 or downstream code.
 */
class WoltProvider implements AggregatorProvider {
  readonly name: AggregatorName = "wolt";
  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret: string,
  ) {}
  async syncMenu(_items: MenuSyncItem[]): Promise<void> {
    throw new Error("WoltProvider.syncMenu: not implemented — pending merchant credentials");
  }
  async ingestOrder(_raw: unknown): Promise<IngestedOrder> {
    throw new Error("WoltProvider.ingestOrder: not implemented — pending merchant credentials");
  }
  async updateStatus(_id: string, _s: Order["status"]): Promise<void> {
    throw new Error("WoltProvider.updateStatus: not implemented — pending merchant credentials");
  }
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean {
    return verifyHmacSignature(rawBody, headers.get("x-wolt-signature"), this.webhookSecret);
  }
}

class GlovoProvider implements AggregatorProvider {
  readonly name: AggregatorName = "glovo";
  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret: string,
  ) {}
  async syncMenu(_items: MenuSyncItem[]): Promise<void> {
    throw new Error("GlovoProvider.syncMenu: not implemented — pending merchant credentials");
  }
  async ingestOrder(_raw: unknown): Promise<IngestedOrder> {
    throw new Error("GlovoProvider.ingestOrder: not implemented — pending merchant credentials");
  }
  async updateStatus(_id: string, _s: Order["status"]): Promise<void> {
    throw new Error("GlovoProvider.updateStatus: not implemented — pending merchant credentials");
  }
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean {
    return verifyHmacSignature(rawBody, headers.get("x-glovo-signature"), this.webhookSecret);
  }
}

// --- Registry ------------------------------------------------------------

export function aggregatorsEnabled(): boolean {
  return process.env.ENABLE_AGGREGATORS === "true";
}

const cached = new Map<AggregatorName, AggregatorProvider>();

export function getAggregatorProvider(name: AggregatorName): AggregatorProvider {
  const hit = cached.get(name);
  if (hit) return hit;
  // In mock mode (no creds yet, dev/staging) we hand back the mock so
  // the webhook routes + sync jobs can exercise the full code path
  // without a real merchant relationship.
  if (name === "wolt") {
    const apiKey = process.env.WOLT_API_KEY?.trim();
    const secret = process.env.WOLT_WEBHOOK_SECRET?.trim();
    const p: AggregatorProvider =
      apiKey && secret ? new WoltProvider(apiKey, secret) : new WoltMockProvider();
    cached.set(name, p);
    return p;
  }
  const apiKey = process.env.GLOVO_API_KEY?.trim();
  const secret = process.env.GLOVO_WEBHOOK_SECRET?.trim();
  const p: AggregatorProvider =
    apiKey && secret ? new GlovoProvider(apiKey, secret) : new GlovoMockProvider();
  cached.set(name, p);
  return p;
}

export function _setAggregatorProviderForTests(name: AggregatorName, provider: AggregatorProvider): void {
  cached.set(name, provider);
}
