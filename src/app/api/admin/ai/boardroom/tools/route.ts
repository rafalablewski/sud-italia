import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listToolsForRole } from "@/lib/ai/tools/registry";
import "@/lib/ai/tools/index";

/**
 * The full tool catalog the calling operator's role can execute — name,
 * description, whether it mutates state, and the minimum role. Powers the
 * Agent HQ editor's tool allowlist so an operator can grant ANY available
 * tool, not just the ones an agent already lists. Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async (_req, _ctx, { user }) => {
  const tools = listToolsForRole(user.role).map((t) => ({
    name: t.name,
    description: t.description,
    mutates: t.mutates,
    minRole: t.minRole,
  }));
  return NextResponse.json({ tools });
});
