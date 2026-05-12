import { NextRequest, NextResponse } from "next/server";
import { getMenuWithOverrides } from "@/data/menus";

/**
 * Public availability snapshot for a location's menu. Returned as a flat
 * { [itemId]: boolean } so the customer client can update in place without
 * re-rendering the full menu DOM.
 *
 * Used by the live-availability hook on the location page (item-86 propagation
 * from admin toggle → customer in under one polling interval). Cached for one
 * second only — admin toggles need to land fast.
 */
export async function GET(req: NextRequest) {
  const locationSlug = req.nextUrl.searchParams.get("location");
  if (!locationSlug) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

  const menu = await getMenuWithOverrides(locationSlug);
  const availability: Record<string, boolean> = {};
  for (const item of menu) availability[item.id] = item.available;

  return NextResponse.json(
    { locationSlug, availability },
    {
      headers: {
        // Polled every ~10s by the client; short cache absorbs bursts without
        // hiding admin 86 actions for more than a polling interval.
        "Cache-Control": "public, max-age=2, s-maxage=2",
      },
    },
  );
}
