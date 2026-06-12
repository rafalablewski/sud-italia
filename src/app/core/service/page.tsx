import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

export default function CoreServiceIndex() {
  redirect(coreHref("/service/floor"));
}
