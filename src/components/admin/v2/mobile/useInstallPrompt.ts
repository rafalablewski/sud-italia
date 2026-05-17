"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallPromptApi {
  /** True when the browser has fired beforeinstallprompt for this session. */
  available: boolean;
  /** True after a successful add-to-home-screen install in this session. */
  installed: boolean;
  /** Trigger the native prompt. Returns the user's choice. */
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

/**
 * Wraps the `beforeinstallprompt` event so the MoreDrawer can offer an
 * "Add to home screen" affordance only when the browser is actually
 * willing to show the prompt. Chrome / Edge / Samsung Internet fire the
 * event; Safari intentionally doesn't (iOS install is manual). On iOS
 * `available` stays false and the caller should hide the affordance.
 */
export function useInstallPrompt(): InstallPromptApi {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  return { available: !!deferred, installed, prompt };
}
