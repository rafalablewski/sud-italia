"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { adminOverlayTarget } from "./portal";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Drives the async save lifecycle for `SaveDock`. Wrap the page's save function:
 *
 * ```tsx
 * const { status, error, save } = useSaveState(persistSettings);
 * <SaveDock dirty={isDirty} count={dirtyCount} status={status} error={error}
 *           onSave={save} onDiscard={reset} />
 * ```
 *
 * The hook owns only the saving→saved→idle / error transition; dirtiness stays
 * page-owned (the page knows when its data diverged from the server).
 */
export function useSaveState(saveFn: () => void | Promise<void>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(async () => {
    setStatus("saving");
    setError(null);
    try {
      await saveFn();
      setStatus("saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }, [saveFn]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, save, reset };
}

interface Props {
  /** Page-owned: are there unsaved changes? Drives whether the dock is shown. */
  dirty: boolean;
  /** Optional count of pending changes ("3 unsaved changes"). */
  count?: number;
  status: SaveStatus;
  error?: string | null;
  onSave: () => void;
  onDiscard?: () => void;
  /** Override the primary button label (default "Save changes"). */
  saveLabel?: string;
}

/**
 * The one save surface for **editor** pages (Menu, Recipes, Growth, Users…).
 * A transient action bar pinned bottom-centre that exists ONLY while there are
 * unsaved changes (or a save is resolving). Replaces the parked, perpetually-
 * disabled hero Save button and the five different save expressions the audit
 * found. Settings/toggles do NOT use this — they autosave (Rule #7).
 *
 * Floats (`--shadow-md`) per the elevation doctrine ("a shadow means temporary /
 * above"). Portaled to `#admin-portal-root` to escape the `.admin-bg > *`
 * stacking trap (Rule #4). See blueprint §3.5.
 */
export function SaveDock({ dirty, count, status, error, onSave, onDiscard, saveLabel = "Save changes" }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visible = dirty || status === "saving" || status === "saved" || status === "error";
  if (!mounted || !visible) return null;

  const dock = (
    <div className="v2-savedock" role="status" aria-live="polite">
      {status === "error" ? (
        <span className="v2-savedock-msg v2-savedock-msg-error">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {error ?? "Couldn't save"}
        </span>
      ) : status === "saved" ? (
        <span className="v2-savedock-msg v2-savedock-msg-ok">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Saved
        </span>
      ) : status === "saving" ? (
        <span className="v2-savedock-msg">
          <Loader2 className="h-3.5 w-3.5 v2-spin" aria-hidden />
          Saving…
        </span>
      ) : (
        <span className="v2-savedock-msg">
          <span className="v2-savedock-dot" aria-hidden />
          {count && count > 1 ? `${count} unsaved changes` : "Unsaved changes"}
        </span>
      )}

      <div className="v2-savedock-actions">
        {status !== "saving" && status !== "saved" && onDiscard && (
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        )}
        {status === "error" ? (
          <Button variant="primary" size="sm" onClick={onSave}>
            Retry
          </Button>
        ) : status !== "saved" ? (
          <Button variant="primary" size="sm" onClick={onSave} loading={status === "saving"} disabled={!dirty}>
            {saveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return createPortal(dock, adminOverlayTarget());
}
