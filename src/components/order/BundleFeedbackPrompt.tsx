"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, CheckCircle } from "lucide-react";

/**
 * Voice-of-customer prompt on the order-confirmation page (audit
 * elite-qsr §2). Renders only for bundle orders — it asks the one
 * question the bundle audit log can't answer: "was the value good?".
 * A single tap (thumbs up / down) POSTs to /api/customer/bundle-feedback;
 * the aggregated thumbs-down rate per bundle surfaces on
 * BundleAnalyticsCard so a high-converting-but-disliked bundle is caught
 * before it shows up as a one-star review.
 *
 * Self-gating: fetches the bundle status for the order and renders
 * nothing when it isn't a bundle order (or the lookup fails), so the
 * confirmation page can mount it unconditionally.
 */
export function BundleFeedbackPrompt({ orderId }: { orderId: string }) {
  const [state, setState] = useState<{
    isBundle: boolean;
    bundleName?: string;
    rated: "up" | "down" | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer/bundle-feedback?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        setState({
          isBundle: !!d.isBundle,
          bundleName: d.bundleName,
          rated: d.existing ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ isBundle: false, rated: null });
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const rate = async (rating: "up" | "down") => {
    if (submitting) return;
    setSubmitting(true);
    // Optimistic — the thank-you should never wait on the network.
    setState((s) => (s ? { ...s, rated: rating } : s));
    try {
      await fetch("/api/customer/bundle-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating }),
        keepalive: true,
      });
    } catch {
      // Best-effort; the optimistic state stays so the customer isn't nagged.
    } finally {
      setSubmitting(false);
    }
  };

  if (!state || !state.isBundle) return null;

  if (state.rated) {
    return (
      <div className="v8-order-card v8-bundle-feedback is-done">
        <CheckCircle className="h-5 w-5" aria-hidden style={{ color: "var(--color-basil-deep)" }} />
        <span>
          <em>Grazie!</em> Thanks for telling us how the{" "}
          {state.bundleName ? state.bundleName : "bundle"} felt.
        </span>
      </div>
    );
  }

  return (
    <div className="v8-order-card v8-bundle-feedback">
      <div className="v8-bundle-feedback-q">
        How was the value? <span className="v8-order-section-it">· il valore</span>
      </div>
      <div className="v8-bundle-feedback-sub">
        Your {state.bundleName ? state.bundleName : "bundle"} — worth it, or not quite?
      </div>
      <div className="v8-bundle-feedback-actions" role="group" aria-label="Rate the bundle value">
        <button
          type="button"
          className="v8-bundle-feedback-btn is-up"
          onClick={() => rate("up")}
          disabled={submitting}
          aria-label="Good value"
        >
          <ThumbsUp className="h-4 w-4" aria-hidden />
          Worth it
        </button>
        <button
          type="button"
          className="v8-bundle-feedback-btn is-down"
          onClick={() => rate("down")}
          disabled={submitting}
          aria-label="Poor value"
        >
          <ThumbsDown className="h-4 w-4" aria-hidden />
          Not quite
        </button>
      </div>
    </div>
  );
}
