"use client";

/**
 * Viewport hook — RETIRED MOBILE SHELL.
 *
 * The admin used to swap in a separate, hand-built phone shell
 * (`MobileShell` + per-page `Mobile*` components) below 900px. That
 * divergent mobile UI is retired: phones now get the **exact same**
 * responsive desktop layout as every other viewport (the `v2-shell`
 * chrome already collapses its sidebar into a hamburger drawer and the
 * pages carry their own `@media (max-width: 720px)` rules). The admin
 * is now 1:1 across phone / tablet / desktop.
 *
 * This hook is kept as a thin, always-"desktop" shim so the ~26 page
 * components and the shell that call `useIsMobile()` keep compiling and
 * uniformly render their desktop variant. The old `MobileShell` /
 * `BottomNav` / `MoreDrawer` code is now dead (never reached) and can
 * be deleted in a follow-up cleanup.
 */

export const FORCE_DESKTOP_KEY = "sud-admin-force-desktop";

/** No-op kept for import compatibility — there is no mobile shell to
 *  fall back from anymore, so "force desktop" is always on. */
export function getForceDesktop(): boolean {
  return true;
}

/** No-op kept for import compatibility. The mobile shell is retired, so
 *  there is nothing to toggle. */
export function setForceDesktop(on: boolean): void {
  void on; /* retired — no-op */
}

export type Viewport = "phone" | "tablet" | "desktop";

export function useIsMobile(): {
  isMobile: boolean;
  isTablet: boolean;
  viewport: Viewport;
  ready: boolean;
  forcedDesktop: boolean;
  rawIsMobile: boolean;
} {
  // Always desktop. Rendered identically on the server and the client,
  // so there is no hydration mismatch and no first-paint flash — the
  // shell can render its real chrome immediately (`ready: true`).
  return {
    isMobile: false,
    isTablet: false,
    viewport: "desktop",
    ready: true,
    forcedDesktop: true,
    rawIsMobile: false,
  };
}
