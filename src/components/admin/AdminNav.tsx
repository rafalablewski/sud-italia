/**
 * Deprecated: replaced by the v2 AdminShell (src/components/admin/v2/AdminShell.tsx).
 * The shell mounts the sidebar + topbar in `src/app/admin/layout.tsx`, so pages
 * no longer need to render their own chrome. This shim renders nothing — kept
 * only so legacy page files continue to import + render `<AdminNav />` without
 * breaking. Will be deleted once every Admin*.tsx page is rewritten to v2.
 */
export function AdminNav() {
  return null;
}
