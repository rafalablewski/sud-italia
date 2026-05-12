import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  getCashSessions,
  openCashSession,
} from "@/lib/store";

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
    try {
      const body = await req.json();
      if (!body.locationSlug) {
        return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
      }
      if (!(await hasLocationAccess(body.locationSlug))) {
        return NextResponse.json(
          { error: `Session is not authorized for location "${body.locationSlug}"` },
          { status: 403 },
        );
      }
      if (!Number.isFinite(body.openingFloat) || body.openingFloat < 0) {
        return NextResponse.json(
          { error: "openingFloat must be a non-negative number (grosze)" },
          { status: 400 },
        );
      }
      const result = await openCashSession({
        locationSlug: body.locationSlug,
        openingFloat: body.openingFloat,
        openedBy: body.openedBy?.trim() || user.email || user.id,
        notes: body.notes?.trim() || undefined,
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
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);
