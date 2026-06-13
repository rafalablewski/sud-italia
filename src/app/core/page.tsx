import { redirect } from "next/navigation";
import { CORE_SURFACES } from "@/core/routes";

// The Core suite lands on the POS till.
export default function CoreIndex() {
  redirect(CORE_SURFACES.pos);
}
