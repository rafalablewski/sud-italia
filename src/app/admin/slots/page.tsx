import { redirect } from "next/navigation";

// Slots is now the Slots view of the merged Service surface.
export default function AdminSlotsPage() {
  redirect("/core/service?view=slots");
}
