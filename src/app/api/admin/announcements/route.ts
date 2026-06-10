import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  deleteAnnouncement,
  getAnnouncements,
  saveAnnouncement,
} from "@/lib/store";
import { announcementCreateSchema, parseBody } from "@/lib/api-schemas";
import { announcementAudienceLabel } from "@/lib/comms";

// The comms management board (post / list / delete announcements). Gated by
// comms.* — owner by default, grantable. Recipients read their own targeted
// feed on /api/admin/my-announcements (any authed user).

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  return NextResponse.json(await getAnnouncements());
});

export const POST = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, announcementCreateSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  const saved = await saveAnnouncement({
    id: data.id,
    title: data.title,
    body: data.body,
    createdBy: user.id,
    createdByName: user.name,
    targetRoles: data.targetRoles,
    targetLocationSlugs: data.targetLocationSlugs,
    targetUserIds: data.targetUserIds,
    pinned: data.pinned,
  });

  await appendAuditLog({
    actor: user.name,
    action: data.id ? "announcements.update" : "announcements.post",
    entityType: "announcement",
    entityId: saved.id,
    after: { title: saved.title, audience: announcementAudienceLabel(saved) },
  });

  return NextResponse.json(saved, { status: data.id ? 200 : 201 });
});

export const DELETE = withAdmin({ roles: ["owner"] }, async (req, _ctx, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteAnnouncement(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await appendAuditLog({ actor: user.name, action: "announcements.delete", entityType: "announcement", entityId: id });
  return NextResponse.json({ ok: true });
});
