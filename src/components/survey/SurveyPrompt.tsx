"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Send, X, CheckCircle } from "lucide-react";
import { StarRating } from "@/components/rating/StarRating";
import { useSurveyStore } from "@/store/survey";
import { useCustomer } from "@/store/customer";
import type { PublicSurvey } from "@/lib/public-settings";
import type { SurveyContext } from "@/store/survey";

/**
 * The Pulse micro-survey card. A small, dismissible prompt that slides up
 * bottom-right (full-width on phones) when the trigger engine
 * (`useSurveyStore`) elects a survey. One tap to rate (1–5 stars), an
 * optional one-line comment, Send. Fire-and-forget POST to /api/surveys.
 *
 * Portalled to document.body (CLAUDE rule 4) so it escapes any stacking
 * context. Identity is passive (cookie) — whatever `useCustomer` knows,
 * never a sign-up wall (rule 6). Mounted once globally, behind the
 * `showNpsSurvey` LayoutGate.
 */
export function SurveyPrompt() {
  const active = useSurveyStore((s) => s.active);
  const [mounted, setMounted] = useState(false);

  // Portal guard — document.body isn't available during SSR. Same pattern
  // as the admin Dialog primitive.
  useEffect(() => setMounted(true), []);

  if (!mounted || !active) return null;

  // Key on survey id so a fresh survey remounts the card with clean local
  // state (no reset effect needed).
  return (
    <PromptCard
      key={active.survey.id}
      survey={active.survey}
      context={active.context}
    />
  );
}

function PromptCard({
  survey,
  context,
}: {
  survey: PublicSurvey;
  context: SurveyContext;
}) {
  const dismiss = useSurveyStore((s) => s.dismiss);
  const markShown = useSurveyStore((s) => s.markShown);
  const markAnswered = useSurveyStore((s) => s.markAnswered);
  const { customer } = useCustomer();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<"ask" | "submitting" | "thanks">("ask");

  // The card painted — only now do we burn the per-survey "seen" + global-gap
  // budgets, so a guest who navigates away before this never gets locked out.
  useEffect(() => {
    markShown(survey.id);
  }, [survey.id, markShown]);

  // Auto-close the thank-you flash.
  useEffect(() => {
    if (phase !== "thanks") return;
    const t = setTimeout(() => markAnswered(survey.id), 2200);
    return () => clearTimeout(t);
  }, [phase, survey.id, markAnswered]);

  const submit = async () => {
    if (rating < 1) return;
    setPhase("submitting");
    try {
      await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId: survey.id,
          rating,
          comment: comment.trim() || undefined,
          phone: customer?.phone,
          name: customer?.name,
          locationSlug: context.locationSlug,
          pagePath:
            context.pagePath ??
            (typeof window !== "undefined" ? window.location.pathname : undefined),
        }),
      });
    } catch {
      // Don't block the thank-you — the answer is best-effort.
    }
    setPhase("thanks");
  };

  return createPortal(
    <div className="v8-pulse" role="dialog" aria-label="Quick survey">
      <button
        type="button"
        className="v8-pulse-close"
        aria-label="Dismiss survey"
        onClick={dismiss}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      {phase === "thanks" ? (
        <div className="v8-pulse-thanks">
          <span className="v8-pulse-thanks-mark" aria-hidden>
            <CheckCircle className="h-5 w-5" />
          </span>
          <p className="v8-pulse-thanks-text">
            <em>Grazie!</em> Thanks for the tip.
          </p>
        </div>
      ) : (
        <>
          <h3 className="v8-pulse-question">{survey.question}</h3>
          {survey.subtext && <p className="v8-pulse-sub">{survey.subtext}</p>}

          <div className="v8-pulse-stars">
            <StarRating
              rating={rating}
              interactive={phase === "ask"}
              size="lg"
              showValue={false}
              onRate={setRating}
            />
          </div>

          <div className="v8-pulse-scale">
            <span>{survey.scaleLow}</span>
            <span>{survey.scaleHigh}</span>
          </div>

          {rating > 0 && (
            <div className="v8-pulse-followup">
              <textarea
                className="v8-pulse-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={survey.commentPrompt}
                rows={2}
                maxLength={500}
              />
              <button
                type="button"
                className="v8-pulse-send"
                onClick={submit}
                disabled={phase === "submitting"}
              >
                {phase === "submitting" ? (
                  "Sending…"
                ) : (
                  <>
                    <Send className="h-4 w-4" aria-hidden />
                    Send <span className="v8-pulse-it">· invia</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
