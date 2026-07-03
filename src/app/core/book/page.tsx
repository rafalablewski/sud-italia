import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

/**
 * Book moved from a top-level Lens into a **Service** view
 * (`/core/service/book`, alongside Floor · Slots · Dispatch). This legacy path
 * forwards there so old links / bookmarks keep working.
 */
export default function LegacyCoreBookPage() {
  redirect(coreHref("/service/book"));
}
