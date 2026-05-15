import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listWaTranscriptHeads } from "@/lib/store";

export const GET = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req) => {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.max(1, Math.min(500, Number.parseInt(limitParam ?? "100", 10) || 100));
    const heads = await listWaTranscriptHeads(limit);
    return NextResponse.json(heads);
  },
);
