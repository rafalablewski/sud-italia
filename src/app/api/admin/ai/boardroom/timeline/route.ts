import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listAgentEvents } from "@/lib/store";

/**
 * Cross-agent activity feed for Agent HQ → Work: every agent's runs, edits,
 * escalations, approvals and scheduled fires, newest first. Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const events = await listAgentEvents({ limit: 80 });
  return NextResponse.json({ events });
});
