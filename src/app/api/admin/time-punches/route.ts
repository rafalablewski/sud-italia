import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getTimePunches, recordTimePunch } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const staffId = req.nextUrl.searchParams.get("staffId") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  return NextResponse.json(await getTimePunches({ staffId, from, to }));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.staffId || !["clock-in", "clock-out"].includes(body.type)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const punch = await recordTimePunch({
      staffId: body.staffId,
      type: body.type,
      shiftId: body.shiftId,
      occurredAt: body.occurredAt,
    });
    return NextResponse.json(punch, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
