"use client";

/**
 * Capability-gated Web Share API helper. When `navigator.share` is
 * available (iOS Safari, Chrome Android, Edge), pops the OS share sheet
 * with the supplied payload. Otherwise falls back to copying the URL to
 * the clipboard so the caller can show a "Copied" toast.
 *
 * Used for: shareable order receipts, daily summaries, refund records.
 */

export interface ShareResult {
  delivered: boolean;
  /** "share" = native share sheet succeeded; "copy" = clipboard fallback. */
  via: "share" | "copy" | "none";
}

export function canShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function";
}

export async function share(payload: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<ShareResult> {
  if (typeof navigator === "undefined") return { delivered: false, via: "none" };
  // Try the native share first.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return { delivered: true, via: "share" };
    } catch (err) {
      // AbortError = user cancelled the sheet → treat as a no-op success.
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("cancel"))
      ) {
        return { delivered: false, via: "share" };
      }
      // Fall through to clipboard.
    }
  }
  // Clipboard fallback — copy the URL if present, else the text body.
  const text = payload.url ?? payload.text ?? "";
  if (!text) return { delivered: false, via: "none" };
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { delivered: true, via: "copy" };
    }
  } catch {
    /* clipboard may be blocked — fall through */
  }
  return { delivered: false, via: "none" };
}
