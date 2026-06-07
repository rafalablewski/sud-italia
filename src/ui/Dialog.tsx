"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { adminOverlayTarget } from "./portal";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Footer slot — typically Button(s). */
  footer?: ReactNode;
  /** Hide the X close button (useful for forced confirmations). */
  hideClose?: boolean;
  /** Max width preset. `md` is default (520px). */
  size?: "sm" | "md" | "lg" | "xl";
  /** Disables outside-click close. */
  disableScrim?: boolean;
  /** Dark "core" skin — for dialogs opened from a Core suite surface (POS /
   *  Guest / KDS) so the modal matches the dark mockup instead of the light
   *  admin glass. Only restyles the dialog chrome; bodies opt in via CSS. */
  theme?: "admin" | "core";
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 380,
  md: 520,
  lg: 720,
  xl: 960,
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideClose = false,
  size = "md",
  disableScrim = false,
  theme = "admin",
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={`v2-dialog-root${theme === "core" ? " v2-dialog-core" : ""}`}>
      <div
        className="v2-dialog-scrim"
        onClick={disableScrim ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "v2-dialog-title" : undefined}
        className="v2-dialog"
        style={{ maxWidth: SIZE_PX[size] }}
      >
        {(title || description || !hideClose) && (
          <header className="v2-dialog-header">
            <div className="v2-dialog-header-text">
              {title && (
                <div id="v2-dialog-title" className="v2-dialog-title">
                  {title}
                </div>
              )}
              {description && <div className="v2-dialog-desc">{description}</div>}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="v2-icon-btn"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </header>
        )}
        <div className="v2-dialog-body">{children}</div>
        {footer && <footer className="v2-dialog-footer">{footer}</footer>}
      </div>
    </div>,
    adminOverlayTarget(),
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  /** Returning `false` (or a rejected promise) keeps the dialog open so the
   *  user can retry. Returning `void` / `true` closes it as usual. */
  onConfirm: () => void | boolean | Promise<void | boolean>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const handleConfirm = async () => {
    setBusy(true);
    try {
      const result = await onConfirm();
      if (result !== false) onClose();
    } catch {
      // Caller surfaced the error (e.g. via toast). Keep the dialog open so
      // the user retains context to retry or cancel.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
