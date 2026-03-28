import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "@/lib/store";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const countOnly = req.nextUrl.searchParams.get("count");
  if (countOnly === "true") {
    return NextResponse.json({ unread: await getUnreadCount() });
  }

  return NextResponse.json(await getNotifications());
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
