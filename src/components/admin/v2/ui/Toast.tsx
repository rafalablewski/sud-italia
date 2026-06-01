"use client";

import { createPortal } from "react-dom";
import { adminOverlayTarget } from "./portal";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";

type ToastTone = "info" | "success" | "warning" | "danger";

interface ToastInput {
  id?: string;
  tone?: ToastTone;
  title: string;
  description?: string;
  /** Auto-dismiss in ms. 0 = sticky. Default: 4000. */
  duration?: number;
}

interface ToastEntry extends Required<Pick<ToastInput, "id" | "tone" | "duration">> {
  title: string;
  description?: string;
}

interface ToastApi {
  show: (t: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setItems((arr) => arr.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput): string => {
      const id = input.id ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tone = input.tone ?? "info";
      const duration = input.duration ?? 4000;
      const entry: ToastEntry = { id, tone, duration, title: input.title, description: input.description };
      setItems((arr) => [...arr.slice(-3), entry]); // cap at 4 visible
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const ref = timers.current;
    return () => {
      ref.forEach((t) => clearTimeout(t));
      ref.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ tone: "success", title, description }),
      error: (title, description) => show({ tone: "danger", title, description }),
      info: (title, description) => show({ tone: "info", title, description }),
      warning: (title, description) => show({ tone: "warning", title, description }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="v2-toasts" aria-live="polite" aria-atomic="false">
            {items.map((t) => {
              const Icon = TONE_ICON[t.tone];
              return (
                <div key={t.id} role="status" className={`v2-toast v2-toast-${t.tone}`}>
                  <span className="v2-toast-icon" aria-hidden>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="v2-toast-text">
                    <div className="v2-toast-title">{t.title}</div>
                    {t.description && <div className="v2-toast-desc">{t.description}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    className="v2-toast-close"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          adminOverlayTarget(),
        )}
    </ToastContext.Provider>
  );
}
