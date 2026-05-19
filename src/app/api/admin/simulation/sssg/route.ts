import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeSssg } from "@/lib/store";
import { parseWindowDays } from "@/lib/simulation-query";

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const windowDays = parseWindowDays(req, 30);
    const snapshot = await computeSssg(windowDays);
    return NextResponse.json(snapshot);
  },
);
