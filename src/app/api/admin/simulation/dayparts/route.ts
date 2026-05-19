import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeDayparts } from "@/lib/store";
import { parseWindowDays } from "@/lib/simulation-query";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const windowDays = parseWindowDays(req, 90);
    const rows = await computeDayparts(windowDays);
    return NextResponse.json({ windowDays, dayparts: rows });
  },
);
