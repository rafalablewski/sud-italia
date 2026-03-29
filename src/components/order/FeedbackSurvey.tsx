"use client";

import { useState, useEffect } from "react";
import { StarRating } from "@/components/rating/StarRating";
import { Button } from "@/components/ui/Button";
import { Heart, Send, CheckCircle, MessageSquare, Mail, Star, ChevronDown, ChevronUp } from "lucide-react";

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
  { id: "speed", label: "Speed", emoji: "⚡" },
  { id: "service", label: "Service", emoji: "😊" },
  { id: "value", label: "Value for Money", emoji: "💰" },
];

export function FeedbackSurvey({ orderId, orderItems = [] }: FeedbackSurveyProps) {
  const [step, setStep] = useState<FeedbackStep>("items");
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [overallRatings, setOverallRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchedItems, setFetchedItems] = useState<OrderItem[]>(orderItems);

  // If no items passed, fetch them from the order API
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
      // Silently fail — don't block the thank you screen
    }
    setStep("thanks");
    setSubmitting(false);
  };

  if (step === "thanks") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center animate-scale-in">
        <div className="w-14 h-14 bg-italia-green/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="h-7 w-7 text-italia-green" />
        </div>
        <h3 className="font-heading font-bold text-lg text-italia-dark mb-1">
          Thank you for your review!
        </h3>
        <p className="text-sm text-italia-gray">
          Your feedback helps us make every dish better.
        </p>
        <p className="text-xs text-italia-gold-dark font-medium mt-3">
          +10 loyalty points added to your account
        </p>
        {email && (
          <p className="text-xs text-italia-green mt-2">
            We&apos;ll send your receipt and points updates to {email}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-slide-up">
      {/* Step 1: Rate each dish you ordered */}
      {step === "items" && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Heart className="h-5 w-5 text-italia-red" />
            <h3 className="font-heading font-semibold text-lg text-italia-dark">
              Rate your dishes
            </h3>
          </div>
          <p className="text-xs text-italia-gray mb-4">
            Tap the stars for each item you ordered
          </p>

          {fetchedItems.length > 0 ? (
            <div className="space-y-3 mb-4">
              {fetchedItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                    itemRatings[item.id]
                      ? "bg-italia-green/[0.03] border-italia-green/20"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <span className="text-sm font-medium text-italia-dark">
                    {item.name}
                  </span>
                  <StarRating
                    rating={itemRatings[item.id] || 0}
                    interactive
                    onRate={(r) => handleItemRate(item.id, r)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-italia-gray">Loading your order items...</p>
            </div>
          )}

          <Button
            onClick={() => setStep("overall")}
            disabled={!allItemsRated}
            className="w-full min-h-[48px]"
          >
            {allItemsRated ? "Next — Rate your experience" : "Rate all items to continue"}
          </Button>
        </div>
      )}

      {/* Step 2: Overall experience + comment */}
      {step === "overall" && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-5 w-5 text-italia-red" />
            <h3 className="font-heading font-semibold text-italia-dark">
              Overall experience
            </h3>
          </div>
          <p className="text-xs text-italia-gray mb-4">
            Quick ratings — all optional
          </p>

          <div className="space-y-3 mb-4">
            {OVERALL_CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between">
                <span className="text-sm text-italia-dark flex items-center gap-2">
                  <span>{cat.emoji}</span>
                  {cat.label}
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
            placeholder="Anything else you'd like to tell us? (optional)"
            className="pub-input min-h-[72px] resize-none text-sm mb-4"
            rows={3}
          />

          <Button
            onClick={() => setStep("email")}
            className="w-full min-h-[48px]"
          >
            Almost done!
          </Button>
        </div>
      )}

      {/* Step 3: Optional email — the moment of delight */}
      {step === "email" && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-5 w-5 text-italia-green" />
            <h3 className="font-heading font-semibold text-italia-dark">
              Want your receipt by email?
            </h3>
          </div>
          <p className="text-xs text-italia-gray mb-4">
            We&apos;ll also send you points updates and exclusive offers. No spam — ever.
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com (optional)"
            className="pub-input min-h-[44px] text-base mb-4"
          />

          <div className="space-y-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full min-h-[48px]"
            >
              {submitting ? (
                "Submitting..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {email.trim() ? "Submit & Send Receipt" : "Submit Review"}
                </>
              )}
            </Button>
            {!email.trim() && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full text-sm text-italia-gray hover:text-italia-dark transition-colors py-2"
              >
                Skip — just submit my review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
