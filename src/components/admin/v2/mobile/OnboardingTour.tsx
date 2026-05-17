"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ChefHat, MoveRight, Plus, X } from "lucide-react";

const SEEN_KEY = "sud-admin-mobile-tour";

interface Step {
  title: string;
  body: string;
  /** "bottom-fab" | "bottom-nav" | "topbar-bell" — anchors the bubble to a UI region. */
  anchor: "bottom-fab" | "bottom-nav" | "topbar-bell";
  icon: "fab" | "swipe" | "bell";
}

const STEPS: Step[] = [
  {
    title: "Tap + for anything",
    body: "The centre button opens quick actions — new order, refund, comp, adjust stock — from any screen.",
    anchor: "bottom-fab",
    icon: "fab",
  },
  {
    title: "Swipe a row to act",
    body: "On orders, swipe right to advance to the next status. Swipe left to cancel. No menus, no taps in modals.",
    anchor: "bottom-nav",
    icon: "swipe",
  },
  {
    title: "Bell for new orders",
    body: "Every fresh order lands in the bell. Tap a row to jump to it. Long-press a list row to multi-select.",
    anchor: "topbar-bell",
    icon: "bell",
  },
];

/**
 * Three-step coach mark tour shown to first-time mobile operators.
 * Persists "seen" in localStorage so a user only sees it once per device.
 * Skippable from any step. Designed to land in under 12 seconds.
 */
export function OnboardingTour() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(SEEN_KEY) === "1") return;
    } catch {
      return;
    }
    // Delay so the shell + first paint settle before we draw a curtain.
    const t = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* non-fatal */
    }
  };

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (!mounted || !visible) return null;

  const current = STEPS[step];

  return createPortal(
    <div className="v2-m-tour-root" role="dialog" aria-modal="true" aria-label="Quick tour">
      <div className="v2-m-tour-scrim" onClick={dismiss} aria-hidden />
      <Cutout anchor={current.anchor} />
      <div className={`v2-m-tour-card v2-m-tour-anchor-${current.anchor}`}>
        <button
          type="button"
          className="v2-m-tour-close"
          onClick={dismiss}
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="v2-m-tour-icon">
          {current.icon === "fab" ? (
            <Plus className="h-5 w-5" aria-hidden />
          ) : current.icon === "swipe" ? (
            <MoveRight className="h-5 w-5" aria-hidden />
          ) : (
            <ChefHat className="h-5 w-5" aria-hidden />
          )}
        </div>
        <div className="v2-m-tour-title">{current.title}</div>
        <div className="v2-m-tour-body">{current.body}</div>
        <div className="v2-m-tour-footer">
          <div className="v2-m-tour-dots" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? "is-active" : ""} />
            ))}
          </div>
          <button
            type="button"
            className="v2-m-btn v2-m-btn-primary"
            onClick={next}
          >
            {step >= STEPS.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Cutout({ anchor }: { anchor: Step["anchor"] }) {
  // A subtle ring highlighting the anchor region. Positions match the
  // bottom-nav / FAB / topbar bell layout in the production shell.
  const style: React.CSSProperties =
    anchor === "bottom-fab"
      ? {
          left: "calc(50% - 36px)",
          bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
          width: 72,
          height: 72,
          borderRadius: 24,
        }
      : anchor === "bottom-nav"
        ? {
            left: 16,
            right: 16,
            bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            height: 56,
            borderRadius: 14,
          }
        : {
            right: 8,
            top: "calc(4px + env(safe-area-inset-top, 0px))",
            width: 48,
            height: 48,
            borderRadius: 14,
          };
  return <div className="v2-m-tour-cutout" style={style} aria-hidden />;
}
