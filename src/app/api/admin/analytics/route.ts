import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSummary } from "@/lib/store";

export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const from = req.nextUrl.searchParams.get("from") || undefined;
    const to = req.nextUrl.searchParams.get("to") || undefined;
    const summary = await getSummary(locationSlug ?? undefined, from, to);
    return NextResponse.json(summary);
  },
);
