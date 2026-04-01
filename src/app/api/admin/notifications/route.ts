import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  deleteNotification,
  pruneOrphanNewOrderNotifications,
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

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
