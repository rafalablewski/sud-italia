import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getAuditLog } from "@/lib/store";

// The audit log records every operator action across the chain. Managers
// and owners can read it; staff/kitchen cannot (the log itself contains
// sensitive details like refund amounts and customer notes).
export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const action = req.nextUrl.searchParams.get("action") || undefined;
    const entityType = req.nextUrl.searchParams.get("entityType") || undefined;
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 200;
    const entries = await getAuditLog({ action, entityType, limit });
    return NextResponse.json(entries);
  },
);
