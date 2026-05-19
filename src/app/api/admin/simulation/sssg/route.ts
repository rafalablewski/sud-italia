import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeSssg } from "@/lib/store";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const raw = req.nextUrl.searchParams.get("days");
    const parsed = raw ? parseInt(raw, 10) : 30;
    const windowDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(365, parsed) : 30;
    const snapshot = await computeSssg(windowDays);
    return NextResponse.json(snapshot);
  },
);
