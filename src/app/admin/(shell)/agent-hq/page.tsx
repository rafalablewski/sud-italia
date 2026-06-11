import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AgentHQ } from "@/admin-v3/AgentHQ";

/**
 * Agent HQ — the operator console for the AI agent fleet. Command center,
 * scorecards, work, approvals, inbox and reports, with a full per-agent
 * editor that regenerates each agent's live system prompt. Everything is
 * fetched from the boardroom/agents API routes, which enforce the manager+
 * gate server-side.
 */
export default async function AdminV3AgentHQPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AgentHQ />;
}
