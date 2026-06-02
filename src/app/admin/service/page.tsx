import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ServiceConsole } from "@/components/admin/service/ServiceConsole";

/**
 * Service — the merged Floor + Slots Core surface. Renders on CoreShell
 * (`.core-suite`), like POS / Guest. This first view is the unified **booking
 * console**: book a dine-in time slot and assign a table in one step. Floor,
 * Slots, Demand and Twin views fold in here next.
 */
export default async function AdminServicePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ServiceConsole />;
}
