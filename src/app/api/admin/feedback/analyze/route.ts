import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getFeedback, setFeedbackAnalysis } from "@/lib/store";
import { analyzeFeedbackBatch } from "@/lib/sentiment";
import { logger } from "@/lib/logger";

const MAX_BATCH = 50;

/**
 * Scan unanalyzed feedback comments through Claude and persist sentiment +
 * themes back to each entry. Idempotent: only entries without an
 * `analyzedAt` (or with `?force=1`) get sent.
 *
 * Costs LLM tokens — manager+ to fire. Designed to be called manually from
 * the admin UI ("Analyze feedback") and on a nightly schedule via Vercel
 * Cron / a GitHub Actions runner (which uses a service-role session).
 */
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
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

    const batch = pending.slice(0, MAX_BATCH).map((f) => ({
      id: f.id,
      rating: f.overallRating,
      comment: f.comment,
    }));

    try {
      const results = await analyzeFeedbackBatch(batch);
      const updated = await setFeedbackAnalysis(results);

      await appendAuditLog({
        actor: user.email || user.id,
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
  },
);
