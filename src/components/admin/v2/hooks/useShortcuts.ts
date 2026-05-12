"use client";

import { useEffect } from "react";

interface Options {
  /** Called when ⌘K / Ctrl+K is pressed (typed-into-input safe). */
  onOpenPalette?: () => void;
  /** Called when "?" is pressed alone (typed-into-input safe). */
  onOpenHelp?: () => void;
  /** Called when "n" is pressed alone (typed-into-input safe). */
  onOpenNotifications?: () => void;
  /**
   * Called with a single letter after the user presses "g" within a short
   * window. e.g. pressing `g` then `d` calls onGoto("d"). The caller maps
   * letters to routes using nav.config.ts shortcuts.
   */
  onGoto?: (key: string) => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

const SEQUENCE_TIMEOUT_MS = 900;

export function useShortcuts({ onOpenPalette, onOpenHelp, onOpenNotifications, onGoto }: Options) {
  useEffect(() => {
    let waitingForGoto = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearGoto = () => {
      waitingForGoto = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K always wins, even inside inputs (standard palette behavior).
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        clearGoto();
        onOpenPalette?.();
        return;
      }

      // Other shortcuts ignored while typing.
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (waitingForGoto) {
        // Consume the second key of `g <letter>`.
        if (/^[a-z,]$/i.test(e.key)) {
          e.preventDefault();
          onGoto?.(e.key.toLowerCase());
        }
        clearGoto();
        return;
      }

      if (e.key === "g" || e.key === "G") {
        waitingForGoto = true;
        timer = setTimeout(() => {
          waitingForGoto = false;
          timer = null;
        }, SEQUENCE_TIMEOUT_MS);
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        onOpenHelp?.();
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onOpenNotifications?.();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearGoto();
    };
  }, [onOpenPalette, onOpenHelp, onOpenNotifications, onGoto]);
}
