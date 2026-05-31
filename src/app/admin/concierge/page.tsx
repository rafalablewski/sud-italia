import { redirect } from "next/navigation";

// Concierge (the AI capability layer) is now a view of the unified Guest hub.
export default function AdminConciergePage() {
  redirect("/admin/guest?view=concierge");
}
