import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AgentPanel } from "@/admin-v3/AgentPanel";

/**
 * Dedicated per-agent page — the individual AI agent panel (scorecard, charter,
 * tools, chat, timeline, controls). Data is fetched client-side from the
 * boardroom/agents API routes, which enforce the manager+ gate server-side.
 */
export default async function AdminV3AgentPanelPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { id } = await params;
  return <AgentPanel id={id} />;
}
