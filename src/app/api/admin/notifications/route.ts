import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  deleteNotification,
  pruneOrphanNewOrderNotifications,
} from "@/lib/store";

export const GET = withAdmin({}, async (req) => {
  const countOnly = req.nextUrl.searchParams.get("count");
  if (countOnly === "true") {
    return NextResponse.json({ unread: await getUnreadCount() });
  }
  return NextResponse.json(await getNotifications());
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (body?.pruneOrphanNewOrders === true) {
        const removed = await pruneOrphanNewOrderNotifications();
        return NextResponse.json({ success: true, removed });
      }
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  },
);

export const PUT = withAdmin({}, async (req) => {
  const { id, markAll } = await req.json();

  if (markAll) {
    await markAllNotificationsRead();
    return NextResponse.json({ success: true });
  }

  if (id) {
    await markNotificationRead(id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Missing id or markAll" }, { status: 400 });
});

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const { id } = await req.json();
      if (!id || typeof id !== "string") {
        return NextResponse.json({ error: "Missing notification id" }, { status: 400 });
      }
      const ok = await deleteNotification(id);
      if (!ok) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  },
);
