import { getFeedback } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_feedback_summary — read-only customer-feedback digest for the CMO:
 * average rating, sentiment mix, the loudest themes, and the most recent
 * negative comments. Reads stored sentiment (set by the feedback analyzer)
 * — it does NOT trigger a fresh Claude scan, so it never spends tokens.
 */
registerTool<{ locationSlug?: string; windowDays?: number }>({
  name: "get_feedback_summary",
  description:
    "Read-only customer-feedback digest: review count, average rating, sentiment mix " +
    "(positive/neutral/negative), top themes, and recent negative comments. Use to read the room and " +
    "decide a reputation or loyalty response. windowDays defaults to 30.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
      windowDays: { type: "number", description: "Trailing window in days (default 30)." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const windowDays = Math.min(180, Math.max(7, Math.round(input.windowDays ?? 30)));
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

    const all = await getFeedback();
    const rows = all.filter(
      (f) => (!loc || f.locationSlug === loc) && f.date >= cutoff,
    );
    if (rows.length === 0) {
      return { ok: true, output: { locationSlug: loc ?? "all", windowDays, count: 0 } };
    }
    const avgRating =
      Math.round((rows.reduce((sum, f) => sum + (f.overallRating ?? 0), 0) / rows.length) * 100) / 100;
    const sentimentMix = rows.reduce<Record<string, number>>((acc, f) => {
      const key = f.sentiment ?? "unscored";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const themeCounts = new Map<string, number>();
    for (const f of rows) for (const t of f.themes ?? []) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
    const topThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme, count]) => ({ theme, count }));
    const recentNegative = rows
      .filter((f) => f.sentiment === "negative" || (f.overallRating ?? 5) <= 2)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map((f) => ({ rating: f.overallRating, comment: (f.comment || "").slice(0, 240), date: f.date.slice(0, 10) }));
    return {
      ok: true,
      output: { locationSlug: loc ?? "all", windowDays, count: rows.length, avgRating, sentimentMix, topThemes, recentNegative },
    };
  },
});
