/**
 * Portal target for admin overlays (dialogs, popovers, tooltips, toasts).
 *
 * Returns the admin layout wrapper `#admin-portal-root` when present, falling
 * back to `<body>`. That wrapper is the right mount for two reasons at once:
 *
 *   1. It is an *ancestor* of `.admin-bg`, so an overlay portaled here still
 *      escapes the `.admin-bg > *` stacking trap (CLAUDE.md Rule #4) — the
 *      whole reason overlays are portaled out of the page tree.
 *   2. It is where the `--font-admin-*` next/font vars are declared (see
 *      `src/app/admin/layout.tsx`), so the overlay's `font-family:
 *      var(--font-ui)` resolves to **Inter**. `<body>` sits *outside* that font
 *      scope, so a body-mounted overlay can't resolve `--font-ui` and falls
 *      back to the browser-default **serif** — which is why portaled overlays
 *      used to render in a different typeface than the in-scope page content.
 *
 * Falls back to `<body>` defensively for any non-admin mount. Call only on the
 * client (every consumer gates on an `open` / `visible` / `mounted` flag).
 */
export function adminOverlayTarget(): HTMLElement {
  return (
    (typeof document !== "undefined" && document.getElementById("admin-portal-root")) ||
    document.body
  );
}
