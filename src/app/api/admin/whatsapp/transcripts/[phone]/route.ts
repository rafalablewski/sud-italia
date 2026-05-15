import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getWaTranscript } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

type RouteCtx = { params: Promise<{ phone: string }> };

export const GET = withAdmin<RouteCtx>(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, ctx) => {
    const { phone: raw } = await ctx.params;
    const phone = normalizePlPhoneE164(decodeURIComponent(raw));
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.max(1, Math.min(500, Number.parseInt(limitParam ?? "100", 10) || 100));
    const messages = await getWaTranscript(phone, limit);
    return NextResponse.json({ phone, messages });
  },
);
