import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser, ROLE_RANK } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";

/**
 * Auth wrapper for Vercel Cron route handlers (m1_12).
 *
 * Vercel Cron invokes the route with `Authorization: Bearer ${CRON_SECRET}`
 * — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * We check that first. For local testing + ad-hoc manual triggers from the
 * admin UI we fall back to a regular owner-only session check.
 *
 * Result: `null` on success (request authorized), or a NextResponse error
 * to return immediately. Drop in at the top of any /api/admin/cron/*
 * handler.
 */
export async function withCron(
  req: NextRequest,
): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (auth && secret && auth === `Bearer ${secret}`) {
    return null;
  }
  // Fallback: owner-only session lets an operator hit the endpoint manually
  // from /admin/* tools without needing to know the secret.
  const user = await getCurrentAdminUser();
  if (user && ROLE_RANK[user.role] >= ROLE_RANK.owner) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Convenience wrapper around logger.info for cron telemetry. */
export function logCronRun(
  job: string,
  detail: Record<string, unknown>,
): void {
  logger.info(`cron.${job}`, { layer: "cron", job, ...detail });
}
