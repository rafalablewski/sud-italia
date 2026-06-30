import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

// Core lands on the Floor — the home base for service. Tapping a table opens
// its check as a panel over the floor (no navigation to a separate till).
export default function CoreIndex() {
  redirect(coreHref("/service/floor"));
}
