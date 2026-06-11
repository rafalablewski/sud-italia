import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getAdminUsers,
  getRoutineTemplates,
  getRoutineCompletions,
  saveRoutineTemplate,
  deleteRoutineTemplate,
  setRoutineDone,
  clearRoutineDone,
  warsawToday,
} from "@/lib/store";
import { myRoutineCreateSchema, routineToggleSchema, parseBody } from "@/lib/api-schemas";
import { isRoutineForUser, type CommsUser, type RoutineLine } from "@/lib/comms";

// The caller's OWN daily routine — the "regular to-do list" that resets every
// day. Unmapped path → no permission gate (any authenticated teammate). The
// list is DERIVED: every team routine that targets this user (by role +
// location) plus their personal routines, each annotated with whether they've
// ticked it *today* (Europe/Warsaw). A new day has no completions, so the whole
// list is fresh — no cron, no per-day rows.

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

// Resolve the session user to the full directory record so team-routine
// matching can read their role + locations (the session context carries the
// role but not the location scope).
async function commsUserFor(id: string): Promise<CommsUser> {
  const u = (await getAdminUsers()).find((x) => x.id === id);
  return {
    id,
    role: u?.role ?? "staff",
    locationSlug: u?.locationSlug,
    locationSlugs: u?.locationSlugs,
  };
}

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  const today = warsawToday();
  const me = await commsUserFor(user.id);
  const [templates, completions] = await Promise.all([
    getRoutineTemplates(),
    getRoutineCompletions(today),
  ]);
  const doneIds = new Set(
    completions.filter((c) => c.userId === user.id).map((c) => c.templateId),
  );
  const lines: RoutineLine[] = templates
    .filter((t) => isRoutineForUser(t, me))
    .map((t) => ({ ...t, done: doneIds.has(t.id), doneAt: undefined }));
  // Outstanding first, then by priority, then alphabetically — so the things
  // still to do sit at the top of the checklist.
  lines.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return a.title.localeCompare(b.title);
  });
  return NextResponse.json(lines);
});

// Add a recurring item to your OWN routine. Always personal + owned by you, so
// it only ever appears on your list (never assigned to anyone else).
export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, myRoutineCreateSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;
  const saved = await saveRoutineTemplate({
    title: data.title,
    detail: data.detail,
    priority: data.priority,
    scope: "personal",
    ownerId: user.id,
    ownerName: user.name,
    active: true,
    createdBy: user.id,
    createdByName: user.name,
  });
  return NextResponse.json({ ...saved, done: false }, { status: 201 });
});

// Tick / un-tick a routine for today. Only routines that actually apply to you
// can be toggled (identity = session, never a query param).
export const PUT = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, routineToggleSchema);
  if ("error" in parsed) return parsed.error;
  const { templateId, done } = parsed.data;

  const me = await commsUserFor(user.id);
  const tpl = (await getRoutineTemplates()).find((t) => t.id === templateId);
  if (!tpl || !isRoutineForUser(tpl, me)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const today = warsawToday();
  if (done) await setRoutineDone(templateId, user.id, today, user.name);
  else await clearRoutineDone(templateId, user.id, today);
  return NextResponse.json({ ok: true, done });
});

// Remove a personal routine you own. Team routines can't be deleted here — the
// server rejects them, and the portal only offers remove on personal lines.
export const DELETE = withAdmin({}, async (req, _ctx, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const tpl = (await getRoutineTemplates()).find((t) => t.id === id);
  if (!tpl || tpl.scope !== "personal" || tpl.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteRoutineTemplate(id);
  return NextResponse.json({ ok: true });
});
