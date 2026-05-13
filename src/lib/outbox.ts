import { createHash } from "crypto";
import { and, asc, eq, isNull, lte, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { outboxEvents } from "@/db/schema";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";

/**
 * Outbox pattern (m1_13). Side effects that must fire exactly once (SMS,
 * email, aggregator-confirm, KDS-notify, etc.) get a row here in the
 * same code path as the parent write — so a crash between the parent
 * commit and the side-effect call doesn't lose the event.
 *
 * `appendOutboxEvent` writes; `drainOutbox` consumes via the cron job. The
 * dispatcher is a stub in Phase 1 — it just logs. Phase 2 m2_15 wires it
 * to the real SMS/email providers via lib/providers/{sms,email}.ts. Phase
 * 2 m2_22 also drains aggregator-confirm events.
 *
 * Failures: each attempt bumps attempt_count + writes last_error. After 5
 * attempts the row is abandoned (logged at error level so the operator
 * notices) but stays in the table for forensic review — never deleted.
 */

const MAX_ATTEMPTS = 5;
const DRAIN_BATCH_SIZE = 100;

const OUTBOX_DDL = [
  `CREATE TABLE IF NOT EXISTS outbox_events (
    id text PRIMARY KEY,
    event_type text NOT NULL,
    entity_type text,
    entity_id text,
    payload jsonb NOT NULL,
    scheduled_for timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 0,
    last_error text,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS outbox_processed_scheduled_idx
    ON outbox_events (processed_at, scheduled_for)`,
  `CREATE INDEX IF NOT EXISTS outbox_event_type_idx
    ON outbox_events (event_type)`,
  `CREATE INDEX IF NOT EXISTS outbox_entity_idx
    ON outbox_events (entity_type, entity_id)`,
];

async function ensureOutboxTable(): Promise<void> {
  await ensureTable("outbox_events", OUTBOX_DDL);
}

export interface OutboxEventInput {
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  /** Optional dedupe key — combined with eventType+entityId to form the row id. */
  dedupeKey?: string;
  /** Optional future-dated dispatch. Defaults to now. */
  scheduledFor?: Date;
}

/**
 * Deterministic id so retries of the parent write don't create duplicate
 * outbox rows. SHA-256 of (eventType | entityType | entityId | dedupeKey)
 * keeps the keyspace pure functional in the inputs.
 */
function outboxEventId(input: OutboxEventInput): string {
  const parts = [
    input.eventType,
    input.entityType ?? "",
    input.entityId ?? "",
    input.dedupeKey ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export async function appendOutboxEvent(input: OutboxEventInput): Promise<void> {
  const db = getDb();
  if (!db) {
    // No DB = local dev / preview without Neon. Log and move on — the dev
    // flow won't fire side effects anyway, and Phase 2 will gate providers
    // on env vars (NoopProvider default) so nothing actually sends.
    logger.debug("appendOutboxEvent: no DB; skipping", {
      eventType: input.eventType,
      entityId: input.entityId,
    });
    return;
  }
  try {
    await ensureOutboxTable();
    await db
      .insert(outboxEvents)
      .values({
        id: outboxEventId(input),
        eventType: input.eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload,
        scheduledFor: input.scheduledFor ?? new Date(),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.error(
      "appendOutboxEvent failed",
      { eventType: input.eventType, entityId: input.entityId, layer: "outbox" },
      err,
    );
    // Don't throw — the parent write should not fail because of an outbox
    // hiccup. Phase 4's "ai variance root-cause" agent can re-derive
    // missed events from audit_log + orders if needed.
  }
}

export interface OutboxDispatchHandler {
  (event: typeof outboxEvents.$inferSelect): Promise<void>;
}

/**
 * Phase 1 stub dispatcher. Logs + returns success. Phase 2 m2_15 replaces
 * this with a switch on eventType that fires the matching provider call.
 */
async function defaultDispatch(event: typeof outboxEvents.$inferSelect): Promise<void> {
  logger.info(`outbox.dispatch.${event.eventType}`, {
    eventId: event.id,
    entityType: event.entityType,
    entityId: event.entityId,
    layer: "outbox",
  });
}

/**
 * Pulls up to DRAIN_BATCH_SIZE unprocessed events whose scheduled_for is in
 * the past and dispatches each. Marks processed on success; bumps
 * attempt_count + writes last_error on failure. Events past MAX_ATTEMPTS
 * are left in the table (processed_at stays null but the cron skips them
 * via the attempt_count clause) so an operator can debug + manually
 * re-enqueue.
 */
export async function drainOutbox(
  dispatcher: OutboxDispatchHandler = defaultDispatch,
): Promise<{ scanned: number; processed: number; failed: number; abandoned: number }> {
  const db = getDb();
  if (!db) return { scanned: 0, processed: 0, failed: 0, abandoned: 0 };

  await ensureOutboxTable();
  const now = new Date();
  const rows = await db
    .select()
    .from(outboxEvents)
    .where(
      and(
        isNull(outboxEvents.processedAt),
        lte(outboxEvents.scheduledFor, now),
        lte(outboxEvents.attemptCount, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(outboxEvents.scheduledFor))
    .limit(DRAIN_BATCH_SIZE);

  let processed = 0;
  let failed = 0;
  let abandoned = 0;
  for (const row of rows) {
    try {
      await dispatcher(row);
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), lastError: null })
        .where(eq(outboxEvents.id, row.id));
      processed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempt = row.attemptCount + 1;
      await db
        .update(outboxEvents)
        .set({
          attemptCount: drizzleSql`${outboxEvents.attemptCount} + 1`,
          lastError: msg.slice(0, 1000),
        })
        .where(eq(outboxEvents.id, row.id));
      failed += 1;
      if (nextAttempt >= MAX_ATTEMPTS) {
        abandoned += 1;
        logger.error(
          "outbox event abandoned after MAX_ATTEMPTS",
          {
            eventId: row.id,
            eventType: row.eventType,
            entityId: row.entityId,
            attempts: nextAttempt,
            layer: "outbox",
          },
          err,
        );
      }
    }
  }
  return { scanned: rows.length, processed, failed, abandoned };
}
