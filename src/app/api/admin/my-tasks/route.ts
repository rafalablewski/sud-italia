import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTasksForAssignee, getTasks, setTaskStatus } from "@/lib/store";
import { taskStatusSchema, parseBody } from "@/lib/api-schemas";

// The caller's OWN to-do list. Unmapped path → no permission gate (any
// authenticated teammate can read + tick off their own tasks). Identity is the
// session user, never a query param, so one user can't touch another's tasks.

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  return NextResponse.json(await getTasksForAssignee(user.id));
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
