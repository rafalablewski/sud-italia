import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltySettings, updateLoyaltySettings } from "@/lib/store";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getLoyaltySettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updates = await req.json();
    const updated = await updateLoyaltySettings(updates);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
