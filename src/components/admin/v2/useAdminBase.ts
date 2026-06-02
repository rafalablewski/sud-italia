"use client";

import { usePathname } from "next/navigation";
import { adminBaseForPath, type AdminBase } from "@/lib/admin-base";

/**
 * The role URL prefix the current page is served under (`/admin`, `/manager`
 * or `/franchisee`) — derived from the visible path, which Next.js keeps as the
 * rewritten-from URL. Sync + flash-free on any admin page. Pair with
 * `withAdminBase()` to re-root canonical `/admin…` hrefs onto it.
 */
export function useAdminBase(): AdminBase {
  return adminBaseForPath(usePathname());
}
