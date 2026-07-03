import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

/**
 * Book is now a **Service** view (`/core/service/book`, alongside Floor · Slots
 * · Dispatch) — it is no longer a Guest sub-tab. This legacy path forwards there
 * so old links / bookmarks keep working.
 */
export default function LegacyGuestBookPage() {
  redirect(coreHref("/service/book"));
}
