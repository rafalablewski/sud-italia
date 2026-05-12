import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { appendAuditLog, getFeedback, setFeedbackAnalysis } from "@/lib/store";
import { analyzeFeedbackBatch } from "@/lib/sentiment";
import { logger } from "@/lib/logger";

const MAX_BATCH = 50;

/**
 * Scan unanalyzed feedback comments through Claude and persist sentiment +
 * themes back to each entry. Idempotent: only entries without an
 * `analyzedAt` (or with `?force=1`) get sent.
 *
 * Designed to be called manually from the admin UI ("Analyze feedback")
 * and on a nightly schedule via Vercel Cron / a GitHub Actions runner.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const all = await getFeedback();
  const pending = all.filter((f) => {
    if (!f.comment || f.comment.trim().length === 0) return false;
    if (force) return true;
    return !f.analyzedAt;
  });

  if (pending.length === 0) {
    return NextResponse.json({ analyzed: 0, total: all.length, message: "Nothing to analyze." });
  }

  // Bound the batch so a single call stays well under model limits and
  // costs predictably. Larger backlogs get analyzed in subsequent runs.
  const batch = pending.slice(0, MAX_BATCH).map((f) => ({
    id: f.id,
    rating: f.overallRating,
    comment: f.comment,
  }));

  try {
    const results = await analyzeFeedbackBatch(batch);
    const updated = await setFeedbackAnalysis(results);

    await appendAuditLog({
      actor: "admin",
      action: "feedback.analyze",
      entityType: "feedback",
      entityId: `batch-of-${updated}`,
      after: { analyzed: updated, force, remaining: pending.length - updated },
    });

    return NextResponse.json({
      analyzed: updated,
      remaining: pending.length - updated,
      total: all.length,
    });
  } catch (err) {
    logger.error(
      "Feedback analyze failed",
      { route: "POST /api/admin/feedback/analyze", batchSize: batch.length },
      err,
    );
    const message = err instanceof Error ? err.message : "Sentiment analysis failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
