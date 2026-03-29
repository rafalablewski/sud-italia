"use client";

import { useState } from "react";
import { StarRating } from "@/components/rating/StarRating";
import { Button } from "@/components/ui/Button";
import { Heart, Send, CheckCircle, MessageSquare } from "lucide-react";

interface FeedbackSurveyProps {
  orderId: string;
}

type FeedbackStep = "rating" | "details" | "thanks";

const FEEDBACK_CATEGORIES = [
  { id: "taste", label: "Taste", emoji: "😋" },
  { id: "speed", label: "Speed", emoji: "⚡" },
  { id: "presentation", label: "Presentation", emoji: "🎨" },
  { id: "value", label: "Value", emoji: "💰" },
  { id: "service", label: "Service", emoji: "😊" },
];

export function FeedbackSurvey({ orderId }: FeedbackSurveyProps) {
  const [step, setStep] = useState<FeedbackStep>("rating");
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOverallRate = (rating: number) => {
    setOverallRating(rating);
    setStep("details");
  };

  const handleCategoryRate = (category: string, rating: number) => {
    setCategoryRatings((prev) => ({ ...prev, [category]: rating }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    // In production, this would POST to an API
    await new Promise((resolve) => setTimeout(resolve, 800));
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
          Thank you for your feedback!
        </h3>
        <p className="text-sm text-italia-gray">
          Your feedback helps us improve. We appreciate every response.
        </p>
        <p className="text-xs text-italia-gold-dark font-medium mt-3">
          +10 loyalty points earned for this review!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-slide-up">
      {step === "rating" && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Heart className="h-5 w-5 text-italia-red" />
            <h3 className="font-heading font-semibold text-lg text-italia-dark">
              How was your meal?
            </h3>
          </div>
          <p className="text-sm text-italia-gray mb-4">
            Your honest feedback makes us better
          </p>
          <div className="flex justify-center">
            <StarRating
              rating={overallRating}
              size="md"
              interactive
              onRate={handleOverallRate}
            />
          </div>
          <p className="text-xs text-italia-gray mt-3">
            Tap a star to rate your experience
          </p>
        </div>
      )}

      {step === "details" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-italia-red" />
            <h3 className="font-heading font-semibold text-italia-dark">
              Tell us more
            </h3>
            <span className="text-sm text-italia-gray">(optional)</span>
          </div>

          {/* Category ratings */}
          <div className="space-y-3 mb-4">
            {FEEDBACK_CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between">
                <span className="text-sm text-italia-dark flex items-center gap-2">
                  <span>{cat.emoji}</span>
                  {cat.label}
                </span>
                <StarRating
                  rating={categoryRatings[cat.id] || 0}
                  interactive
                  onRate={(r) => handleCategoryRate(cat.id, r)}
                />
              </div>
            ))}
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any additional comments? We read every one..."
            className="pub-input min-h-[80px] resize-none text-sm mb-4"
            rows={3}
          />

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
                Submit Feedback
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
