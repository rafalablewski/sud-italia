import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings, updateSettings } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const updates = await req.json();
    const settings = await updateSettings(updates);
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
