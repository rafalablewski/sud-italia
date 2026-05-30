import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { appendAuditLog, getTempLogs, saveTempLog } from "@/lib/store";
import { parseBody, tempLogCreateSchema } from "@/lib/api-schemas";

// HACCP temperature log (audit §11.2 / §12.4 #5). Reading is a line task, so
// any authenticated staff member can record + view; the location is enforced.

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }
    const from = req.nextUrl.searchParams.get("from") || undefined;
    const to = req.nextUrl.searchParams.get("to") || undefined;
    return NextResponse.json(
      await getTempLogs({ locationSlug, fromIso: from, toIso: to }),
    );
  },
);

export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, tempLogCreateSchema);
  if ("error" in parsed) return parsed.error;
  const { locationSlug, sensor, tempCelsius, recordedBy } = parsed.data;

  if (!(await hasLocationAccess(locationSlug))) {
    return NextResponse.json(
      { error: `Session is not authorized for location "${locationSlug}"` },
      { status: 403 },
    );
  }

  const actor = recordedBy?.trim() || user.email || user.id;
  const log = await saveTempLog({
    locationSlug,
    sensor,
    tempCelsius,
    recordedBy: actor,
    recordedAt: new Date().toISOString(),
  });
  if (!log) {
    return NextResponse.json({ error: "Could not record reading" }, { status: 500 });
  }

  // A flagged (out-of-range) reading is the whole point of HACCP — audit-log it
  // so the breach is traceable for inspectors + insurers.
  await appendAuditLog({
    actor,
    action: log.status === "flagged" ? "haccp.temp_flagged" : "haccp.temp_ok",
    entityType: "temp_log",
    entityId: log.id,
    after: { sensor, tempCelsius, status: log.status, locationSlug },
  });

  return NextResponse.json(log, { status: 201 });
});
