import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  getCashSessions,
  openCashSession,
} from "@/lib/store";
import { cashOpenSchema, parseBody } from "@/lib/api-schemas";

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getCashSessions(locationSlug ?? undefined));
  },
);

// Opening a cash session affects revenue reconciliation — manager+ only.
// Per-location tenancy: the body must specify a slug the session is
// authorized for.
export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, cashOpenSchema);
    if ("error" in parsed) return parsed.error;
    const { locationSlug, openingFloat, openedBy, notes } = parsed.data;

    if (!(await hasLocationAccess(locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${locationSlug}"` },
        { status: 403 },
      );
    }

    const result = await openCashSession({
      locationSlug,
      openingFloat,
      openedBy: openedBy?.trim() || user.email || user.id,
      notes: notes?.trim() || undefined,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: "A cash session is already open for this location", existing: result.existing },
        { status: 409 },
      );
    }

    await appendAuditLog({
      actor: result.openedBy,
      action: "cash.open",
      entityType: "cash_session",
      entityId: result.id,
      after: { openingFloat: result.openingFloat, locationSlug: result.locationSlug },
    });

    return NextResponse.json(result, { status: 201 });
  },
);
