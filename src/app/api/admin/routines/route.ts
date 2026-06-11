import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getRoutineTemplates,
  saveRoutineTemplate,
  deleteRoutineTemplate,
} from "@/lib/store";
import { routineCreateSchema, parseBody } from "@/lib/api-schemas";
import type { RoutineTemplate } from "@/lib/comms";

// The TEAM-routine management board (the standing daily-ops checklist —
// orders, delivery, clean walls, coffee-machine maintenance…). Gated by comms.*
// — owner by default, grantable to a manager via the Permission Matrix (same
// gate as the Tasks board). Each teammate's personal daily list (team routines
// that match them + their own personal routines, with today's tick state) lives
// on /api/admin/my-routines (any authed user).

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  // Only the manager-defined team routines belong on the board; personal ones
  // are private to the teammate who created them and never surface here.
  const all = await getRoutineTemplates();
  return NextResponse.json(all.filter((t) => t.scope === "team"));
});

export const POST = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, routineCreateSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // Guard the upsert: a manager may only edit a TEAM routine here, never reach
  // in and overwrite someone's personal routine by guessing its id.
  if (data.id) {
    const existing = (await getRoutineTemplates()).find((t) => t.id === data.id);
    if (existing && existing.scope !== "team") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const saved: RoutineTemplate = await saveRoutineTemplate({
    id: data.id,
    title: data.title,
    detail: data.detail,
    priority: data.priority,
    scope: "team",
    assigneeRoles: data.assigneeRoles?.length ? data.assigneeRoles : undefined,
    locationSlugs: data.locationSlugs?.length ? data.locationSlugs : undefined,
    active: data.active ?? true,
    createdBy: user.id,
    createdByName: user.name,
  });

  await appendAuditLog({
    actor: user.name,
    action: data.id ? "routines.update" : "routines.create",
    entityType: "routine",
    entityId: saved.id,
    after: { title: saved.title, active: saved.active },
  });

  return NextResponse.json(saved, { status: data.id ? 200 : 201 });
});

export const DELETE = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Don't let the board delete a personal routine.
  const existing = (await getRoutineTemplates()).find((t) => t.id === id);
  if (!existing || existing.scope !== "team") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteRoutineTemplate(id);
  await appendAuditLog({ actor: user.name, action: "routines.delete", entityType: "routine", entityId: id });
  return NextResponse.json({ ok: true });
});
