import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTasksForAssignee, getTasks, saveTask, setTaskStatus, deleteTask } from "@/lib/store";
import { myTaskCreateSchema, taskStatusSchema, parseBody } from "@/lib/api-schemas";

// The caller's OWN to-do list. Unmapped path → no permission gate (any
// authenticated teammate can read, add to, tick off, and clear their own
// tasks). Identity is the session user, never a query param, so one user can't
// touch — or assign onto — another's tasks.

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  return NextResponse.json(await getTasksForAssignee(user.id));
});

// Add an item to your own to-do list. Assignee = creator = the session user, so
// this can never push a task onto a teammate (that's the gated management board,
// /api/admin/tasks). A self-added task therefore has createdBy === assigneeId,
// which the portal uses to label it "Added by you" and offer a remove control.
export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, myTaskCreateSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  const created = await saveTask({
    title: data.title,
    detail: data.detail,
    assigneeId: user.id,
    assigneeName: user.name,
    createdBy: user.id,
    createdByName: user.name,
    priority: data.priority,
    dueDate: data.dueDate,
    status: "open",
  });
  return NextResponse.json(created, { status: 201 });
});

export const PUT = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, taskStatusSchema);
  if ("error" in parsed) return parsed.error;
  const { id, status } = parsed.data;

  // You may only change the status of a task assigned to you.
  const mine = (await getTasks()).find((t) => t.id === id);
  if (!mine || mine.assigneeId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await setTaskStatus(id, status);
  return NextResponse.json(updated);
});

// Remove a to-do you added yourself. Restricted to self-added items
// (assignee === creator === you) so a teammate can clear their own clutter but
// can never delete a task a manager assigned them — for those, "Done" is the
// only exit, keeping the manager's assignment record intact.
export const DELETE = withAdmin({}, async (req, _ctx, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const mine = (await getTasks()).find((t) => t.id === id);
  if (!mine || mine.assigneeId !== user.id || mine.createdBy !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteTask(id);
  return NextResponse.json({ ok: true });
});
