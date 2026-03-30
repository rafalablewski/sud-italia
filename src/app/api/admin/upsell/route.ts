import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getUpsellSettings, updateLocationUpsell } from "@/lib/store";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUpsellSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { locationSlug, config } = body;

  if (!locationSlug || !config) {
    return NextResponse.json({ error: "Missing locationSlug or config" }, { status: 400 });
  }

  const settings = await updateLocationUpsell(locationSlug, config);
  return NextResponse.json(settings);
}
