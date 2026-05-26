import { useCallback, useEffect, useState } from "react";

/**
 * Drives an immersive fullscreen surface: tracks the state, requests native
 * browser fullscreen (best-effort — the immersive layout stands on its own if
 * denied), drops out when the browser leaves fullscreen, locks body scroll
 * while active, and exits on Escape. Shared by the KDS fleet wall and the
 * floor kiosk, which render their board through a portal while `active`.
 */
export function useFullscreen(): { active: boolean; enter: () => void; exit: () => void } {
  const [active, setActive] = useState(false);

  const enter = useCallback(() => {
    setActive(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);

  // Keep React state in lock-step with the browser: leaving native fullscreen
  // (Esc, browser control) drops us out.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // While active, lock body scroll and allow Escape to exit even when native
  // fullscreen was denied (no fullscreenchange to catch).
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, exit]);

  return { active, enter, exit };
}
