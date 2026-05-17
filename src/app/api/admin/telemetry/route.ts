import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getCurrentAdminUser, isAuthenticated } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";

interface TelemetryPayload {
  span?: string;
  durationMs?: number;
  ts?: string;
  extras?: Record<string, unknown>;
}

/**
 * Operator-action telemetry sink.
 *
 * Writes:
 *   - Logger line (always)
 *   - `telemetry_spans` Postgres row (when DB is configured)
 *
 * The client posts via `navigator.sendBeacon`. Body cap is 4 KiB to
 * avoid abuse, span name is validated against a fixed allowlist of
 * known instrumentation points so a poisoned client can't fill the
 * table with junk strings.
 *
 * Reads (GET): per-span aggregations — p50, p95, count, last 24 h —
 * for the audit's success-criteria dashboard.
 */
const MAX_BYTES = 4096;

const KNOWN_SPANS = new Set<string>([
  "kds.bump",
  "orders.refund",
  "orders.comp",
  "orders.advance",
  "customers.lookup",
  "inventory.adjust",
  "dashboard.glance",
  "alerts.view",
  "ai.agent.open",
]);

async function ensureTable(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telemetry_spans (
      id bigserial PRIMARY KEY,
      span text NOT NULL,
      duration_ms integer NOT NULL,
      user_id text,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      extras jsonb
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS telemetry_spans_span_time
    ON telemetry_spans (span, occurred_at DESC)
  `);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: true });
  }
  let body: TelemetryPayload;
  try {
    body = JSON.parse(raw) as TelemetryPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (typeof body.span !== "string" || typeof body.durationMs !== "number") {
    return NextResponse.json({ ok: true });
  }
  if (!KNOWN_SPANS.has(body.span)) {
    // Silently drop unknown spans — a typo at the call site shouldn't
    // pollute the table. Still log it so we can spot the typo.
    logger.debug("admin.telemetry.unknown_span", { span: body.span });
    return NextResponse.json({ ok: true });
  }
  if (body.durationMs < 0 || body.durationMs > 10 * 60 * 1000) {
    return NextResponse.json({ ok: true });
  }
  logger.info("admin.telemetry", {
    span: body.span,
    durationMs: body.durationMs,
    ts: body.ts,
    extras: body.extras,
  });
  const db = getDb();
  if (db) {
    try {
      await ensureTable();
      const user = await getCurrentAdminUser();
      await db.execute(sql`
        INSERT INTO telemetry_spans (span, duration_ms, user_id, extras)
        VALUES (${body.span}, ${Math.round(body.durationMs)}, ${user?.id ?? null}, ${
          body.extras ? JSON.stringify(body.extras) : null
        }::jsonb)
      `);
    } catch (err) {
      logger.warn("admin.telemetry.persist_failed", { layer: "telemetry" }, err);
    }
  }
  return NextResponse.json({ ok: true });
}

interface SpanStat {
  span: string;
  count: number;
  p50: number;
  p95: number;
  lastAt: string | null;
}

export async function GET(): Promise<Response> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ spans: [] });
  }
  try {
    await ensureTable();
    const rows = (await db.execute(sql`
      SELECT
        span,
        COUNT(*)::int AS count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95,
        MAX(occurred_at) AS last_at
      FROM telemetry_spans
      WHERE occurred_at > now() - interval '24 hours'
      GROUP BY span
      ORDER BY count DESC
    `)) as unknown as {
      span: string;
      count: number;
      p50: number;
      p95: number;
      last_at: Date | string | null;
    }[];
    const spans: SpanStat[] = rows.map((r) => ({
      span: r.span,
      count: r.count,
      p50: r.p50,
      p95: r.p95,
      lastAt:
        r.last_at instanceof Date
          ? r.last_at.toISOString()
          : (r.last_at as string | null),
    }));
    return NextResponse.json({ spans });
  } catch (err) {
    logger.warn("admin.telemetry.read_failed", { layer: "telemetry" }, err);
    return NextResponse.json({ spans: [] });
  }
}
