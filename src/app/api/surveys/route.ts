import { NextRequest, NextResponse } from "next/server";
import { getActiveSurveys, saveSurveyResponse } from "@/lib/store";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePlPhoneE164 } from "@/lib/phone";
import type { SurveyResponse } from "@/lib/surveys";

/**
 * Capture one Pulse micro-survey answer. Public + zero-friction (CLAUDE
 * rule 6): no auth, identity is whatever passive cookie data the client
 * passes along. Rate-limited per IP (and per phone when known) the same
 * way /api/feedback is, so a single guest can't stuff the board.
 */
export async function POST(req: NextRequest) {
  const ipLimit = await enforceRateLimit({
    key: "survey-ip",
    id: getClientIp(req),
    limit: 12,
    windowSec: 60,
  });
  if (ipLimit) return ipLimit;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    surveyId,
    rating,
    comment,
    phone,
    name,
    locationSlug,
    pagePath,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof surveyId !== "string" || !surveyId) {
    return NextResponse.json({ error: "Missing surveyId" }, { status: 400 });
  }
  const numericRating = Number(rating);
  if (
    !Number.isInteger(numericRating) ||
    numericRating < 1 ||
    numericRating > 5
  ) {
    return NextResponse.json(
      { error: "rating must be an integer 1–5" },
      { status: 400 },
    );
  }

  // The survey must be a live one — never persist an answer to a survey
  // the operator has switched off or that doesn't exist.
  const active = await getActiveSurveys();
  const survey = active.find((s) => s.id === surveyId);
  if (!survey) {
    return NextResponse.json(
      { error: "Survey not found or inactive" },
      { status: 404 },
    );
  }

  // Phone-scoped limit (when we have it) blocks one guest spamming across IPs.
  const normalizedPhone =
    typeof phone === "string" && phone.trim()
      ? normalizePlPhoneE164(phone) ?? undefined
      : undefined;
  if (normalizedPhone) {
    const phoneLimit = await enforceRateLimit({
      key: "survey-phone",
      id: normalizedPhone,
      limit: 8,
      windowSec: 60,
    });
    if (phoneLimit) return phoneLimit;
  }

  const entry: SurveyResponse = {
    id: `srv-${crypto.randomUUID()}`,
    surveyId,
    trigger: survey.trigger,
    rating: numericRating,
    comment:
      typeof comment === "string" && comment.trim()
        ? comment.trim().slice(0, 500)
        : undefined,
    customerPhone: normalizedPhone,
    customerName:
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 120)
        : undefined,
    locationSlug:
      typeof locationSlug === "string" && locationSlug.trim()
        ? locationSlug.trim()
        : undefined,
    pagePath:
      typeof pagePath === "string" && pagePath.trim()
        ? pagePath.trim().slice(0, 200)
        : undefined,
    date: new Date().toISOString(),
  };

  await saveSurveyResponse(entry);

  return NextResponse.json({ success: true });
}
