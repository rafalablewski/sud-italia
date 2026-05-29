"use client";

import { useState, useEffect } from "react";
import { StarRating } from "@/components/rating/StarRating";
import { Heart, Send, CheckCircle, MessageSquare, Mail } from "lucide-react";

interface OrderItem {
  name: string;
  id: string;
}

interface FeedbackSurveyProps {
  orderId: string;
  orderItems?: OrderItem[];
}

type FeedbackStep = "items" | "overall" | "email" | "thanks";

const OVERALL_CATEGORIES = [
  { id: "speed", label: "Speed", italian: "velocità", emoji: "⚡" },
  { id: "service", label: "Service", italian: "servizio", emoji: "😊" },
  { id: "value", label: "Value", italian: "valore", emoji: "💰" },
];

/**
 * V8 post-order feedback wizard. Three steps inside the same paper
 * card: rate each dish → overall categories + free-text → optional
 * email for receipt + offers. Submission is fire-and-forget; failure
 * doesn't block the thank-you screen.
 *
 * Audit ties: feeds `/api/feedback` which the admin Feedback surface
 * consumes; +10 loyalty points credited server-side on submission.
 */
export function FeedbackSurvey({ orderId, orderItems = [] }: FeedbackSurveyProps) {
  const [step, setStep] = useState<FeedbackStep>("items");
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [overallRatings, setOverallRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchedItems, setFetchedItems] = useState<OrderItem[]>(orderItems);

  useEffect(() => {
    if (fetchedItems.length > 0) return;
    fetch(`/api/orders?orderId=${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.order?.items) {
          setFetchedItems(
            data.order.items.map((ci: { menuItem: { name: string; id: string } }) => ({
              name: ci.menuItem.name,
              id: ci.menuItem.id,
            }))
          );
        }
      })
      .catch(() => {});
  }, [orderId, fetchedItems.length]);

  const handleItemRate = (itemId: string, rating: number) => {
    setItemRatings((prev) => ({ ...prev, [itemId]: rating }));
  };

  const handleOverallRate = (category: string, rating: number) => {
    setOverallRatings((prev) => ({ ...prev, [category]: rating }));
  };

  const allItemsRated = fetchedItems.length > 0 && fetchedItems.every((item) => itemRatings[item.id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          itemRatings,
          overallRatings,
          comment: comment.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
    } catch {
      // Silently fail — don't block the thank-you screen
    }
    setStep("thanks");
    setSubmitting(false);
  };

  if (step === "thanks") {
    return (
      <div className="v8-order-card v8-order-feedback-thanks">
        <div className="v8-order-feedback-thanks-mark" aria-hidden="true">
          <CheckCircle className="h-6 w-6" />
        </div>
        <h3 className="v8-order-feedback-thanks-h3">
          <em>Grazie!</em> Thank you for your review.
        </h3>
        <p className="v8-order-feedback-thanks-sub">
          Your feedback helps us make every dish better.
        </p>
        <p className="v8-order-feedback-thanks-pts">
          +10 loyalty points <em>· punti aggiunti</em>
        </p>
        {email && (
          <p
            className="v8-order-feedback-thanks-sub"
            style={{ marginTop: 8, color: "var(--color-basil-deep)" }}
          >
            Receipt + updates will arrive at {email}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="v8-order-card v8-order-feedback">
      {step === "items" && (
        <>
          <div className="v8-order-feedback-head">
            <Heart className="h-5 w-5" aria-hidden />
            <h3 className="v8-order-feedback-title">
              Rate your dishes <span className="v8-order-section-it">· vota i piatti</span>
            </h3>
          </div>
          <p className="v8-order-feedback-sub">Tap the stars for each item you ordered.</p>

          {fetchedItems.length > 0 ? (
            <div className="v8-order-feedback-rows">
              {fetchedItems.map((item) => (
                <div
                  key={item.id}
                  className={`v8-order-feedback-row${itemRatings[item.id] ? " is-rated" : ""}`}
                >
                  <span className="v8-order-feedback-row-name">{item.name}</span>
                  <StarRating
                    rating={itemRatings[item.id] || 0}
                    interactive
                    onRate={(r) => handleItemRate(item.id, r)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="v8-order-feedback-empty">Loading your order items…</div>
          )}

          <button
            type="button"
            onClick={() => setStep("overall")}
            disabled={!allItemsRated}
            className="v8-order-feedback-cta"
          >
            {allItemsRated ? (
              <>
                Next <span className="it">· avanti</span>
              </>
            ) : (
              "Rate all items to continue"
            )}
          </button>
        </>
      )}

      {step === "overall" && (
        <>
          <div className="v8-order-feedback-head">
            <MessageSquare className="h-5 w-5" aria-hidden />
            <h3 className="v8-order-feedback-title">
              Overall experience <span className="v8-order-section-it">· l&apos;esperienza</span>
            </h3>
          </div>
          <p className="v8-order-feedback-sub">Quick ratings — all optional.</p>

          <div className="v8-order-feedback-rows">
            {OVERALL_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className={`v8-order-feedback-row${overallRatings[cat.id] ? " is-rated" : ""}`}
              >
                <span className="v8-order-feedback-row-name">
                  <span className="glyph" aria-hidden>{cat.emoji}</span>
                  {cat.label} <span className="v8-order-section-it">· {cat.italian}</span>
                </span>
                <StarRating
                  rating={overallRatings[cat.id] || 0}
                  interactive
                  onRate={(r) => handleOverallRate(cat.id, r)}
                />
              </div>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything else you'd like to tell us? · qualcos'altro?"
            className="v8-order-feedback-textarea"
            rows={3}
          />

          <button
            type="button"
            onClick={() => setStep("email")}
            className="v8-order-feedback-cta"
          >
            Almost done <span className="it">· quasi fatto</span>
          </button>
        </>
      )}

      {step === "email" && (
        <>
          <div className="v8-order-feedback-head">
            <Mail className="h-5 w-5" aria-hidden />
            <h3 className="v8-order-feedback-title">
              Receipt by email? <span className="v8-order-section-it">· ricevuta via email</span>
            </h3>
          </div>
          <p className="v8-order-feedback-sub">
            We&apos;ll also send points updates and seasonal openings. No spam — ever.
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ale@esempio.it (optional)"
            className="v8-order-feedback-input"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="v8-order-feedback-cta"
          >
            {submitting ? (
              "Submitting…"
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>
                  {email.trim() ? "Submit + send receipt" : "Submit review"}
                </span>
                <span className="it">· invia</span>
              </>
            )}
          </button>
          {!email.trim() && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="v8-order-feedback-skip"
            >
              Skip — just submit my review
            </button>
          )}
        </>
      )}
    </div>
  );
}
