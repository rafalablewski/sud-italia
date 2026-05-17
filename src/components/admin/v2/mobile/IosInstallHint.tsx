"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "sud-admin-ios-install-hint";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS: navigator.standalone | matchMedia(display-mode)
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports MacIntel — check touch points to distinguish.
  return (
    navigator.platform === "MacIntel" &&
    (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
    ((navigator as unknown as { maxTouchPoints: number }).maxTouchPoints) > 1
  );
}

/**
 * Subtle banner shown only on iOS Safari (which has no native install
 * prompt) the first time an operator opens the admin. Explains the
 * Share → Add to Home Screen gesture and dismisses persistently.
 *
 * Hidden when:
 *   - Not iOS
 *   - Already running in standalone (installed)
 *   - User dismissed previously
 */
export function IosInstallHint() {
  const [dismissed, setDismissed] = useState(true); // default hidden until probe completes

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === "1") return;
    } catch {
      /* storage blocked → just don't show */
      return;
    }
    if (!isIos() || isStandalone()) return;
    setDismissed(false);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* non-fatal */
    }
  };

  if (dismissed) return null;

  return (
    <div className="v2-m-ios-hint" role="status">
      <div className="v2-m-ios-hint-text">
        Install on iPhone: tap{" "}
        <Share
          className="inline h-3.5 w-3.5"
          aria-hidden
          style={{ verticalAlign: -2, color: "var(--info)" }}
        />{" "}
        in Safari, then <strong>Add to Home Screen</strong>.
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="v2-m-ios-hint-close"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
