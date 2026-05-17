import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getDb } from "@/db/client";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

interface SubscribePayload {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

async function ensureTable(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
      user_id text NOT NULL,
      endpoint text PRIMARY KEY,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Admin push subscription endpoint. Mirror of the customer
 * /api/push/subscribe but scoped to the authenticated admin user so
 * "Refund requested" / "Cash variance over X" / "Low slots" can wake the
 * owner's phone instead of the customer's.
 *
 * The push *emission* (called from order-status hooks, cron jobs, etc.)
 * is a separate concern — this endpoint just records who's listening.
 */
export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as SubscribePayload;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Missing endpoint or keys" }, { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  await ensureTable();
  await db.execute(sql`
    INSERT INTO admin_push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${user.id}, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth})
    ON CONFLICT (endpoint)
    DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `);
  logger.info("admin.push.subscribe", { userId: user.id, endpoint: body.endpoint.slice(0, 80) });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAdmin({}, async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: true });
  }
  await ensureTable();
  await db.execute(sql`
    DELETE FROM admin_push_subscriptions WHERE endpoint = ${body.endpoint}
  `);
  return NextResponse.json({ ok: true });
});
