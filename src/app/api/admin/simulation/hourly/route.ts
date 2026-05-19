import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeHourlyThroughput } from "@/lib/store";
import { parseWindowDays } from "@/lib/simulation-query";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const windowDays = parseWindowDays(req, 30);
    const rawCap = req.nextUrl.searchParams.get("pizzasPerHour");
    const cap = rawCap ? parseFloat(rawCap) : 0;
    const pizzasPerHourCap = Number.isFinite(cap) && cap > 0 ? cap : 0;
    const rows = await computeHourlyThroughput(windowDays, pizzasPerHourCap);
    return NextResponse.json({ windowDays, pizzasPerHourCap, hourly: rows });
  },
);
