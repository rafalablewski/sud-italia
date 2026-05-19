import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeHourlyThroughput } from "@/lib/store";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const rawDays = req.nextUrl.searchParams.get("days");
    const days = rawDays ? parseInt(rawDays, 10) : 30;
    const windowDays = Number.isFinite(days) && days > 0 ? Math.min(365, days) : 30;
    const rawCap = req.nextUrl.searchParams.get("pizzasPerHour");
    const cap = rawCap ? parseFloat(rawCap) : 0;
    const pizzasPerHourCap = Number.isFinite(cap) && cap > 0 ? cap : 0;
    const rows = await computeHourlyThroughput(windowDays, pizzasPerHourCap);
    return NextResponse.json({ windowDays, pizzasPerHourCap, hourly: rows });
  },
);
