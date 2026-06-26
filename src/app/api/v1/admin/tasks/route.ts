import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getTasks, setTaskStatus } from "@/lib/store";
import type { TaskStatus } from "@/lib/comms";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATUSES: TaskStatus[] = ["open", "done", "archived", "deleted"];

/**
 * `GET /api/v1/admin/tasks` — shift to-dos, mirroring web `/admin/comms/tasks`.
 * Manager+. Open tasks first, then by due date.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const tasks = (await getTasks()).filter((t) => t.status !== "deleted");
    tasks.sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
    return apiOk(tasks, { count: tasks.length, open: tasks.filter((t) => t.status === "open").length });
  } catch (err) {
    logger.error("v1 admin tasks failed", { layer: "api.v1.admin.tasks" }, err as Error);
    return apiError("internal", "Could not load tasks");
  }
}

/**
 * `PATCH /api/v1/admin/tasks` — set a task's status (e.g. mark done). Body
 * `{ id, status }`. Manager+.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body.id || !body.status || !STATUSES.includes(body.status as TaskStatus)) {
    return apiError("validation_failed", `id and status (${STATUSES.join("|")}) are required`);
  }
  try {
    const updated = await setTaskStatus(body.id, body.status as TaskStatus);
    if (!updated) return apiError("not_found", "No such task");
    return apiOk(updated);
  } catch (err) {
    logger.error("v1 admin tasks patch failed", { layer: "api.v1.admin.tasks" }, err as Error);
    return apiError("internal", "Could not update the task");
  }
}
