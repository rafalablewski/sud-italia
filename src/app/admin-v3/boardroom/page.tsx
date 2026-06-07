import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { BoardroomV3 } from "@/components/admin/v3/BoardroomV3";

/**
 * Boardroom — the AI C-suite team console (CEO/COO/CFO/CMO). Live
 * traffic-light KPIs, per-agent panels with Claude chat, and multi-agent
 * meetings. The component fetches everything from the boardroom API
 * routes, which enforce the manager+ gate server-side.
 */
export default async function AdminV3BoardroomPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <BoardroomV3 />;
}
