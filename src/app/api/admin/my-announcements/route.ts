import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getAnnouncements, markAnnouncementReadBy } from "@/lib/store";
import { announcementReadSchema, parseBody } from "@/lib/api-schemas";
import { isAnnouncementForUser } from "@/lib/comms";

// The caller's OWN announcements feed. Unmapped path → no permission gate (any
// authenticated teammate reads what's targeted at them). Pinned + unread float
// to the top; each row carries a `read` flag for this user.

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  const all = await getAnnouncements();
  const mine = all
    .filter((a) => isAnnouncementForUser(a, user))
    .map((a) => ({ ...a, read: a.readBy.includes(user.id) }));
  mine.sort((x, y) => {
    if (!!y.pinned !== !!x.pinned) return y.pinned ? 1 : -1;
    if (x.read !== y.read) return x.read ? 1 : -1;
    return y.createdAt.localeCompare(x.createdAt);
  });
  return NextResponse.json(mine);
});

export const PUT = withAdmin({}, async (req, _ctx, { user }) => {
  const parsed = await parseBody(req, announcementReadSchema);
  if ("error" in parsed) return parsed.error;
  const { id } = parsed.data;

  // Only mark read something actually targeted at you.
  const ann = (await getAnnouncements()).find((a) => a.id === id);
  if (!ann || !isAnnouncementForUser(ann, user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await markAnnouncementReadBy(id, user.id);
  return NextResponse.json({ ok: true });
});
