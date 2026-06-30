"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Download, Share, Plus, X } from "lucide-react";

/**
 * One button, both install paths.
 *
 * Our two PWAs (Ottaviano, OttavianoKDS) install differently per platform:
 *   - Chromium (Android / desktop) fires `beforeinstallprompt` — we capture it
 *     and trigger the native install dialog on click.
 *   - iOS / iPadOS Safari has no such API; "Add to Home Screen" is a manual
 *     Share-sheet step — we show a short illustrated how-to instead.
 *
 * The button hides itself once the app is already running standalone (installed)
 * so it never nags an installed user. The how-to overlay mounts to document.body
 * via createPortal (Rule #4) so the admin/core stacking contexts can't trap it.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect the touch-Mac case too.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

// The native iOS apps (Ottaviano / OttavianoKDS) render the web inside a
// WKWebView whose user agent carries a `NativeWrapper` token. Offering to
// "install the app" inside an already-native app is nonsense — so suppress it.
function isNativeWrapper(): boolean {
  if (typeof navigator === "undefined") return false;
  return /NativeWrapper/.test(navigator.userAgent);
}

export function InstallAppButton({
  appName,
  tone = "light",
  className = "",
}: {
  /** "Ottaviano" or "OttavianoKDS" — shown in the button + how-to copy. */
  appName: string;
  /** Visual tone for the inline button (the host surface palette). */
  tone?: "light" | "dark";
  className?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  // Browser-only capabilities (display-mode, iOS UA) are unknown during SSR —
  // resolve them once after mount. `mounted` also gates the portal render.
  const [env, setEnv] = useState({ mounted: false, installed: false, ios: false, nativeWrapper: false });
  const { mounted, installed, ios, nativeWrapper } = env;

  useEffect(() => {
    // Single post-mount snapshot of client capabilities (one setState → no
    // cascading renders); subsequent changes come from the events below.
    // display-mode + iOS UA are unavailable during SSR, so this MUST run in an
    // effect — the one legitimate setState-in-effect (client-only detection).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ mounted: true, installed: isStandalone(), ios: isIos(), nativeWrapper: isNativeWrapper() });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEnv((p) => ({ ...p, installed: true }));
      setDeferred(null);
      setShowHowTo(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed, or running inside the native iOS wrapper → nothing to offer.
  if (!mounted || installed || nativeWrapper) return null;

  // Non-iOS browsers that never fired beforeinstallprompt (e.g. already
  // dismissed, unsupported) → don't show a button that can't do anything.
  if (!deferred && !ios) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setEnv((p) => ({ ...p, installed: true }));
      setDeferred(null);
      return;
    }
    // iOS: no programmatic install — show the Share-sheet how-to.
    setShowHowTo(true);
  };

  const toneStyles: Record<"light" | "dark", CSSProperties> = {
    light: { background: "#C8102E", color: "#FFF8F0" },
    dark: { background: "#E8B23A", color: "#11161F" },
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        style={toneStyles[tone]}
        className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition active:scale-95 ${className}`}
      >
        <Download size={18} aria-hidden />
        Install {appName}
      </button>

      {showHowTo &&
        mounted &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Install ${appName}`}
            onClick={() => setShowHowTo(false)}
            style={{ position: "fixed", inset: 0, zIndex: 2147483000 }}
            className="flex items-end justify-center bg-black/70 p-4 sm:items-center"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-6 text-neutral-900 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Add {appName} to your Home Screen</h2>
                <button
                  type="button"
                  onClick={() => setShowHowTo(false)}
                  aria-label="Close"
                  className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
                >
                  <X size={20} />
                </button>
              </div>
              <ol className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                    <Share size={16} aria-hidden />
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                    <Plus size={16} aria-hidden />
                  </span>
                  <span>
                    Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                  </span>
                </li>
              </ol>
              <p className="mt-5 text-xs text-neutral-500">
                {appName} then opens full-screen from your Home Screen — like a native app.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
