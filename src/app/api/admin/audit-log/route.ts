import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, deleteAuditLog, getAuditLog } from "@/lib/store";

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

// Purging the trail is owner-only — even managers who can read it cannot
// erase it, so the people the log audits can't tamper with it. Body is either
// `{ all: true }` (wipe everything) or `{ ids: string[] }` (the selected /
// filtered rows). The purge itself is recorded so the trail still shows it
// happened, by whom, and how many rows went.
export const DELETE = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    let body: { all?: unknown; ids?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // Empty / invalid body falls through to the 400 below.
    }

    let deleted: number;
    let scope: string;
    if (body.all === true) {
      deleted = await deleteAuditLog({ all: true });
      scope = "all";
    } else if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((x): x is string => typeof x === "string");
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "No entries selected" },
          { status: 400 },
        );
      }
      deleted = await deleteAuditLog({ ids });
      scope = `${ids.length} selected`;
    } else {
      return NextResponse.json(
        { error: "Specify { all: true } or { ids: string[] }" },
        { status: 400 },
      );
    }

    await appendAuditLog({
      actor: user.email || user.name || user.id,
      action: "audit.purge",
      entityType: "AuditLog",
      after: { scope, deleted },
    });

    return NextResponse.json({ deleted });
  },
);
