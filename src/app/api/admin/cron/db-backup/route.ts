import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { runBackup } from "@/lib/backup";
import { logger } from "@/lib/logger";

/**
 * Nightly logical backup of the Neon database to S3 (Appendix A — "Nightly DB
 * backup + documented restore"). Wired in vercel.json crons; can also be
 * triggered manually by an owner from any admin tool that POSTs here.
 *
 * Auth: withCron (Bearer CRON_SECRET, or an owner session for manual runs).
 * Restore procedure: docs/runbooks/backup-restore.md + scripts/restore-backup.ts.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  try {
    const result = await runBackup();
    if (result.skipped) {
      logCronRun("db-backup", { skipped: result.skipped });
      return NextResponse.json({ ok: true, skipped: result.skipped });
    }
    logCronRun("db-backup", {
      key: result.key,
      bytes: result.bytes,
      tableCount: result.tableCount,
      rowCount: result.rowCount,
    });
    return NextResponse.json(result);
  } catch (err) {
    // Backup failure is an operational alert, not a silent skip — surface it
    // to Sentry (logger.error mirrors there) so the operator knows last
    // night's snapshot didn't land.
    logger.error("cron.db-backup failed", { layer: "cron.backup", alert: "backup.failed" }, err);
    return NextResponse.json(
      { ok: false, error: "backup failed" },
      { status: 500 },
    );
  }
}
