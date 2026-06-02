import { redirect } from "next/navigation";

// The CRM customer book is now the Guests view of the unified Guest hub.
export default function AdminCrmPage() {
  redirect("/core/guest?view=guests");
}
