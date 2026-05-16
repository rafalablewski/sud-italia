import { NextRequest, NextResponse } from "next/server";
import { count, lt } from "drizzle-orm";
import { logCronRun, withCron } from "@/lib/cron";
import { getDb } from "@/db/client";
import { auditLog, checkoutAttempts, webhookEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Audit §4 "no retention/trim" on webhook_events, audit_log, etc.
 * Without bounded retention these tables grow unbounded and the query
 * plans on the customer / order detail pages decay over months.
 *
 * Policy (conservative; widen via env vars if compliance needs longer):
 *   - webhook_events:    30 days  (purely de-dup; older retries are noise)
 *   - checkout_attempts: 7 days   (idempotency replay window, payment-stale)
 *   - audit_log:         180 days (financial inspector ask; mirror to S3
 *                                  cold storage before this expires when
 *                                  the operator turns it on)
 *
 * Bytes-deleted is logged so the dashboard can show "your tables shrank
 * by 12 MB last night" — operational confidence in the trim cron.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const db = getDb();
  if (!db) {
    logCronRun("retention-trim", { skipped: "no DATABASE_URL" });
    return NextResponse.json({ ok: true, skipped: "no DATABASE_URL" });
  }

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const webhookCutoff = days(parseInt(process.env.RETENTION_WEBHOOK_EVENTS_DAYS || "30", 10));
  const checkoutCutoff = days(parseInt(process.env.RETENTION_CHECKOUT_ATTEMPTS_DAYS || "7", 10));
  const auditCutoff = days(parseInt(process.env.RETENTION_AUDIT_LOG_DAYS || "180", 10));

  const result: Record<string, { deleted: number; error?: string }> = {};

  // Gemini review on PR #38: don't ask the DB to ship every deleted row
  // back over the wire just so we can `.length` the result — that's
  // expensive at scale where a 30-day backlog of webhook events can be
  // tens or hundreds of thousands of rows. Instead, COUNT first (cheap
  // index scan on the timestamp index) and then DELETE without
  // RETURNING. Two round-trips per table, bounded transfer.

  try {
    const rows = await db
      .select({ n: count() })
      .from(webhookEvents)
      .where(lt(webhookEvents.processedAt, webhookCutoff));
    const deleted = Number(rows[0]?.n ?? 0);
    if (deleted > 0) {
      await db.delete(webhookEvents).where(lt(webhookEvents.processedAt, webhookCutoff));
    }
    result.webhook_events = { deleted };
  } catch (err) {
    logger.error("retention-trim webhook_events failed", { layer: "cron.retention" }, err);
    result.webhook_events = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const rows = await db
      .select({ n: count() })
      .from(checkoutAttempts)
      .where(lt(checkoutAttempts.createdAt, checkoutCutoff));
    const deleted = Number(rows[0]?.n ?? 0);
    if (deleted > 0) {
      await db.delete(checkoutAttempts).where(lt(checkoutAttempts.createdAt, checkoutCutoff));
    }
    result.checkout_attempts = { deleted };
  } catch (err) {
    logger.error("retention-trim checkout_attempts failed", { layer: "cron.retention" }, err);
    result.checkout_attempts = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const rows = await db
      .select({ n: count() })
      .from(auditLog)
      .where(lt(auditLog.occurredAt, auditCutoff));
    const deleted = Number(rows[0]?.n ?? 0);
    if (deleted > 0) {
      await db.delete(auditLog).where(lt(auditLog.occurredAt, auditCutoff));
    }
    result.audit_log = { deleted };
  } catch (err) {
    logger.error("retention-trim audit_log failed", { layer: "cron.retention" }, err);
    result.audit_log = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  logCronRun("retention-trim", { cutoffs: { webhookCutoff, checkoutCutoff, auditCutoff }, result });
  return NextResponse.json({ ok: true, cutoffs: { webhookCutoff, checkoutCutoff, auditCutoff }, result });
}
