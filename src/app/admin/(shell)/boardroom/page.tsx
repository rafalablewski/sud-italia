import { redirect } from "next/navigation";

/**
 * The Boardroom was rebuilt as Agent HQ (the editable AI agent fleet console).
 * Keep the old route working — bounce it to the canonical /admin/agent-hq.
 */
export default function AdminV3BoardroomRedirect() {
  redirect("/admin/agent-hq");
}
