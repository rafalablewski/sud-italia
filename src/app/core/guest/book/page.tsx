import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

/**
 * Book was promoted from a Guest sub-tab to a top-level Lens (`/core/book`).
 * This legacy path just forwards there so old links / bookmarks keep working.
 */
export default function LegacyGuestBookPage() {
  redirect(coreHref("/book"));
}
