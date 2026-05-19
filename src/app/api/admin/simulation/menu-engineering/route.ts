import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeMenuEngineering } from "@/lib/store";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const raw = req.nextUrl.searchParams.get("days");
    const parsed = raw ? parseInt(raw, 10) : 90;
    const windowDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(365, parsed) : 90;
    const rows = await computeMenuEngineering(windowDays);
    return NextResponse.json({ windowDays, items: rows });
  },
);
