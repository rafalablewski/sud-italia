import { getDb } from "@/db/client";
import { webhookEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Idempotency primitives for inbound webhooks and outbound checkout retries.
 *
 * Both back onto Postgres tables introduced in m0_7 (Drizzle bootstrap). The
 * read-modify-write race we used to have — `new Set<string>()` in process
 * memory at the top of src/app/api/webhook/route.ts:20 — is resolved by
 * INSERT ... ON CONFLICT DO NOTHING with a RETURNING check.
 *
 * When DATABASE_URL is absent (local dev / preview without Neon) we fall back
 * to an in-process Set. This loses idempotency across instances, but only in
 * environments that don't have a real DB anyway.
 */

const inProcessWebhookSeen = new Set<string>();

/**
 * Records a webhook event as processed. Returns `true` the first time we see
 * (provider, eventId), `false` on every subsequent retry from the same
 * provider. Callers should short-circuit and respond 200 + `{duplicate:true}`
 * when this returns false.
 */
export async function claimWebhookEvent(
  provider: string,
  eventId: string,
  eventType?: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) {
    const key = `${provider}:${eventId}`;
    if (inProcessWebhookSeen.has(key)) return false;
    inProcessWebhookSeen.add(key);
    logger.debug("claimWebhookEvent: no DB, using in-process set", {
      provider,
      eventId,
    });
    return true;
  }
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider, eventId, eventType })
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });
  return inserted.length > 0;
}
