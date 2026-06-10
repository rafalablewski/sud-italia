import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  deleteTask,
  getAdminUsers,
  getTasks,
  saveTask,
} from "@/lib/store";
import { taskCreateSchema, parseBody } from "@/lib/api-schemas";
import { userLocationSlugs } from "@/lib/user-locations";
import type { Task } from "@/lib/comms";

// The comms management board (assign / list / delete tasks). Gated by comms.*
// — owner by default (role-default gate below), grantable to a manager via the
// Permission Matrix (withAdmin honours the granular grant for custom users).
// Personal reads + done-toggles live on /api/admin/my-tasks (any authed user).

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  return NextResponse.json(await getTasks());
});

export const POST = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, taskCreateSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // Resolve the concrete set of assignees: explicit user ids ∪ everyone in a
  // targeted role (optionally narrowed to locations). One Task row per person,
  // so each carries its own done-state.
  const users = await getAdminUsers();
  const byId = new Map(users.map((u) => [u.id, u]));
  const targetIds = new Set<string>(data.assigneeIds ?? []);
  if (data.assigneeRoles?.length) {
    const locs = data.locationSlugs ?? [];
    for (const u of users) {
      if (u.status === "disabled") continue;
      if (!data.assigneeRoles.includes(u.role)) continue;
      if (locs.length && !userLocationSlugs(u).some((s) => locs.includes(s))) continue;
      targetIds.add(u.id);
    }
  }

  const created: Task[] = [];
  for (const aid of targetIds) {
    const au = byId.get(aid);
    if (!au) continue;
    created.push(
      await saveTask({
        title: data.title,
        detail: data.detail,
        assigneeId: au.id,
        assigneeName: au.name,
        createdBy: user.id,
        createdByName: user.name,
        locationSlug: data.locationSlug,
        priority: data.priority,
        dueDate: data.dueDate,
        status: "open",
      }),
    );
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: "No matching assignees — pick a person or a role+location that resolves to someone." },
      { status: 400 },
    );
  }

  await appendAuditLog({
    actor: user.name,
    action: "tasks.assign",
    entityType: "task",
    entityId: created.map((t) => t.id).join(","),
    after: { title: data.title, assignees: created.length },
  });

  return NextResponse.json(created, { status: 201 });
});

export const DELETE = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteTask(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await appendAuditLog({ actor: user.name, action: "tasks.delete", entityType: "task", entityId: id });
  return NextResponse.json({ ok: true });
});
