import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getAuditLog } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const action = req.nextUrl.searchParams.get("action") || undefined;
  const entityType = req.nextUrl.searchParams.get("entityType") || undefined;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 200;
  const entries = await getAuditLog({ action, entityType, limit });
  return NextResponse.json(entries);
}
