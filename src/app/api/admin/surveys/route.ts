import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getSurveyResponses,
  getSurveys,
  updateSurvey,
} from "@/lib/store";

/**
 * Admin Pulse-survey board. GET returns the full catalogue + every captured
 * response (the AdminSurveys component does the scoring + filtering client
 * side). PUT patches one survey definition — the active toggle, copy, or
 * cooldown — and is manager+ since it changes what customers see.
 */
export const GET = withAdmin({}, async () => {
  const [surveys, responses] = await Promise.all([
    getSurveys(),
    getSurveyResponses(),
  ]);
  responses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return NextResponse.json({ surveys, responses });
});

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { id, ...rest } = (body ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "Missing survey id" }, { status: 400 });
    }

    // Whitelist editable fields — `trigger` is intentionally excluded (it is
    // wired to concrete client signals; updateSurvey drops it defensively too).
    const updates: Record<string, unknown> = {};
    if (typeof rest.active === "boolean") updates.active = rest.active;
    if (typeof rest.question === "string") updates.question = rest.question.slice(0, 160);
    if (typeof rest.subtext === "string") updates.subtext = rest.subtext.slice(0, 200);
    if (typeof rest.scaleLow === "string") updates.scaleLow = rest.scaleLow.slice(0, 40);
    if (typeof rest.scaleHigh === "string") updates.scaleHigh = rest.scaleHigh.slice(0, 40);
    if (typeof rest.commentPrompt === "string")
      updates.commentPrompt = rest.commentPrompt.slice(0, 160);
    if (
      typeof rest.cooldownDays === "number" &&
      Number.isFinite(rest.cooldownDays) &&
      rest.cooldownDays >= 0
    ) {
      updates.cooldownDays = Math.min(365, Math.round(rest.cooldownDays));
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await updateSurvey(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    await appendAuditLog({
      actor: user.email || user.id,
      action: "survey.update",
      entityType: "survey",
      entityId: id,
      after: updated,
    });

    return NextResponse.json(updated);
  },
);
