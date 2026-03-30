import { NextRequest, NextResponse } from "next/server";
import { getUpsellSettings } from "@/lib/store";

export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get("location");
  const settings = await getUpsellSettings();

  if (location && settings[location]) {
    return NextResponse.json(settings[location]);
  }

  // Return empty — caller uses hardcoded defaults
  return NextResponse.json(null);
}
