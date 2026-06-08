"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Core v2's OWN toast primitive — no dependency on the admin `src/ui` kit.
 * A small bottom-centre stack, portaled into the `.cv2` theme root so it picks
 * up the core-v2 tokens + fonts. `useCoreToast()` returns a `toast(msg, tone?)`
 * function. Styled by `.cv-toast*` in themes/core-v2/index.css.
 */

type Tone = "default" | "success" | "danger";
interface ToastItem {
  id: number;
  msg: string;
  tone: Tone;
}

const ToastCtx = createContext<((msg: string, tone?: Tone) => void) | null>(null);

export function CoreV2ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [root, setRoot] = useState<Element | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    setRoot(document.querySelector(".cv2"));
  }, []);

  const toast = useCallback((msg: string, tone: Tone = "default") => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, msg, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {root &&
        createPortal(
          <div className="cv-toast-stack" role="status" aria-live="polite">
            {items.map((t) => (
              <div key={t.id} className={`cv-toast ${t.tone}`}>
                {t.msg}
              </div>
            ))}
          </div>,
          root,
        )}
    </ToastCtx.Provider>
  );
}

export function useCoreToast(): (msg: string, tone?: Tone) => void {
  const ctx = useContext(ToastCtx);
  // No-op fallback so a surface rendered outside the provider never crashes.
  return ctx ?? (() => {});
}
