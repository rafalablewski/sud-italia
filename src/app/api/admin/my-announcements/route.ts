import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getAnnouncements,
  markAnnouncementReadBy,
  setAnnouncementStateFor,
} from "@/lib/store";
import { announcementActionSchema, parseBody } from "@/lib/api-schemas";
import { isAnnouncementForUser, announcementStateFor } from "@/lib/comms";

// The caller's OWN announcements feed. Unmapped path → no permission gate (any
// authenticated teammate reads what's targeted at them). Each row carries this
// user's `read` flag + mailbox `state` (inbox / archived / deleted). Pinned +
// unread float to the top within a tab.

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  const all = await getAnnouncements();
  const mine = all
    .filter((a) => isAnnouncementForUser(a, user))
    .map((a) => ({
      ...a,
      read: a.readBy.includes(user.id),
      state: announcementStateFor(a, user.id),
    }));
  mine.sort((x, y) => {
    if (!!y.pinned !== !!x.pinned) return y.pinned ? 1 : -1;
    if (x.read !== y.read) return x.read ? 1 : -1;
    return y.createdAt.localeCompare(x.createdAt);
  });
  return NextResponse.json(mine);
});

// Audit action label per mailbox action, so the admin Audit log reads cleanly.
const AUDIT_ACTION = {
  read: "notification.read",
  archive: "notification.archive",
  delete: "notification.delete",
  restore: "notification.restore",
} as const;

export const PUT = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, announcementActionSchema);
  if ("error" in parsed) return parsed.error;
  const { id, action } = parsed.data;

  // Only act on something actually targeted at you (identity = session, never a
  // query param), so one teammate can't touch another's mailbox.
  const ann = (await getAnnouncements()).find((a) => a.id === id);
  if (!ann || !isAnnouncementForUser(ann, user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "read") {
    await markAnnouncementReadBy(id, user.id);
  } else {
    const state = action === "archive" ? "archived" : action === "delete" ? "deleted" : "inbox";
    await setAnnouncementStateFor(id, user.id, state);
  }

  // Every interaction is logged to the central Audit log so an owner/admin can
  // review who opened / archived / deleted which notification, and when.
  await appendAuditLog({
    actor: user.name,
    action: AUDIT_ACTION[action],
    entityType: "announcement",
    entityId: id,
    after: { title: ann.title },
  });

  return NextResponse.json({ ok: true });
});
