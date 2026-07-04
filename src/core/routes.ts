/**
 * Single source of truth for Core's route namespace.
 *
 * Every Core href — the surface switcher, the per-surface view tabs, the
 * index `redirect()`s — is built from `CORE_BASE` here. Re-basing Core (a
 * future redesign promoted into place, or moving the suite under another
 * segment) is then a ONE-LINE change in this file, never a sweep across the
 * shell, tabs, redirects and deep-links. See the "Naming contract & swap
 * playbook" in docs/design-system/core/README.md.
 */
export const CORE_BASE = "/core";

/** Join a sub-path onto the Core base, e.g. `coreHref("/pos")` → `/core/pos`. */
export const coreHref = (path = ""): string => `${CORE_BASE}${path}`;

/**
 * The primary Core surfaces. The Lens Rail (`CoreNav`) carries service → Tables,
 * pos → Line, kds → Pass, and `guest` (its own hub: Inbox · CRM · Loyalty ·
 * Concierge). `orders` stays a cross-cutting surface reached from the Command
 * Bar's ⌘K (not a room lens). `book` is a **Service** view
 * (`/core/service/book`, alongside Tables · Slots · Dispatch), not a lens.
 */
export const CORE_SURFACES = {
  pos: coreHref("/pos"),
  kds: coreHref("/kds"),
  orders: coreHref("/orders"),
  guest: coreHref("/guest"),
  service: coreHref("/service"),
  book: coreHref("/service/book"),
} as const;
