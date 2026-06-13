import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { EventsV3 } from "@/admin-v3/EventsV3";

export default async function AdminV3EventsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <EventsV3 />;
}
