import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeCohortSnapshot } from "@/lib/store";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const raw = req.nextUrl.searchParams.get("days");
    const parsed = raw ? parseInt(raw, 10) : 180;
    const windowDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(365, parsed) : 180;
    const snapshot = await computeCohortSnapshot(windowDays);
    return NextResponse.json(snapshot);
  },
);
