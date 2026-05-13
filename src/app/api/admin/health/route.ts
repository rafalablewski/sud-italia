import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { withAdmin } from "@/lib/api-middleware";
import { getUpstashRedis } from "@/lib/upstash-redis";
import { snapshotLockMetrics } from "@/lib/locks";
import { snapshotLazyBackfillCounters } from "@/db/migrate";

/**
 * Operational health endpoint. Returns connectivity + latency for every
 * external dependency the platform leans on, plus the in-process lock
 * metrics from m0_1. Intended for the uptime monitor (Better Uptime / Pingdom)
 * and a Phase 1 ops dashboard.
 *
 * Admin-only so an attacker can't probe our infra topology. Aggregated
 * status field returns "ok" / "degraded" / "down" so the monitor can alert
 * on the boolean without parsing the full payload.
 */

interface Check {
  name: string;
  status: "ok" | "degraded" | "down" | "skipped";
  latencyMs?: number;
  detail?: string;
}

async function checkDb(): Promise<Check> {
  if (!process.env.DATABASE_URL) {
    return { name: "neon", status: "skipped", detail: "DATABASE_URL not set" };
  }
  const start = Date.now();
  try {
    const sql = neon(process.env.DATABASE_URL);
    // SELECT 1 is the canonical liveness probe. We also count rows in the
    // idempotency tables, which doubles as a self-test that the m0_7b
    // self-bootstrap ran and the tables exist.
    const rows = await sql`SELECT 1 AS ok`;
    const latencyMs = Date.now() - start;
    if (rows[0]?.ok !== 1) {
      return { name: "neon", status: "down", latencyMs, detail: "Unexpected response" };
    }
    // 500ms is the threshold where users notice slowness on a checkout.
    return {
      name: "neon",
      status: latencyMs > 500 ? "degraded" : "ok",
      latencyMs,
    };
  } catch (err) {
    return {
      name: "neon",
      status: "down",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

async function checkRedis(): Promise<Check> {
  const redis = getUpstashRedis();
  if (!redis) {
    return {
      name: "upstash",
      status: "skipped",
      detail: "UPSTASH_REDIS_REST_URL not set — locks fall back to in-process",
    };
  }
  const start = Date.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Date.now() - start;
    if (pong !== "PONG") {
      return { name: "upstash", status: "down", latencyMs, detail: `ping returned ${pong}` };
    }
    return {
      name: "upstash",
      status: latencyMs > 300 ? "degraded" : "ok",
      latencyMs,
    };
  } catch (err) {
    return {
      name: "upstash",
      status: "down",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

function aggregate(checks: Check[]): "ok" | "degraded" | "down" {
  const real = checks.filter((c) => c.status !== "skipped");
  if (real.some((c) => c.status === "down")) return "down";
  if (real.some((c) => c.status === "degraded")) return "degraded";
  return "ok";
}

export const GET = withAdmin({}, async () => {
  const [neonCheck, redisCheck] = await Promise.all([checkDb(), checkRedis()]);
  const checks: Check[] = [neonCheck, redisCheck];
  const status = aggregate(checks);
  const locks = snapshotLockMetrics();
  // Per-entity lazy-backfill counters from src/db/migrate.ts. Each entry is
  // "how many times the read path fell back to kv_store because the row
  // wasn't in the normalized table yet." Trending to zero means Phase 1's
  // dual-write has caught the legacy data up; an operator can then plan a
  // future kv_store drop with confidence.
  const lazyBackfill = snapshotLazyBackfillCounters();

  return NextResponse.json(
    {
      status,
      checks,
      locks,
      lazyBackfill,
      // Operators often care about which build is live during an incident.
      // VERCEL_GIT_COMMIT_SHA is populated automatically on Vercel deployments
      // and works as a deploy correlation id.
      build: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        ref: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      },
      now: new Date().toISOString(),
    },
    {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
});
