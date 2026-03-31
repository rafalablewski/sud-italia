import { NextRequest, NextResponse } from "next/server";
import { getUpsellSettings } from "@/lib/store";
import { locations } from "@/data/locations";

const validSlugs = new Set(locations.map((l) => l.slug));

export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get("location");

  if (!location || !validSlugs.has(location)) {
    return NextResponse.json(null);
  }

  const settings = await getUpsellSettings();
  return NextResponse.json(settings[location] || null);
}
