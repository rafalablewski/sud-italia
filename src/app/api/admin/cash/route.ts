import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  appendAuditLog,
  getCashSessions,
  openCashSession,
} from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  return NextResponse.json(await getCashSessions(location));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;

  try {
    const body = await req.json();
    if (!body.locationSlug) {
      return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
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
      openedBy: body.openedBy?.trim() || "admin",
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
}
