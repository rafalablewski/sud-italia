import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getWaCampaign } from "@/lib/store";
import { sendCampaignBatch } from "@/lib/whatsapp/broadcast";

type RouteCtx = { params: Promise<{ id: string }> };

// One client tick sends a small slice; the UI calls this repeatedly until the
// campaign is done, so no single request blocks on hundreds of template sends.
const BATCH_SIZE = 25;

export const POST = withAdmin<RouteCtx>(
  { roles: ["manager", "owner"] },
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const campaign = await getWaCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const updated = await sendCampaignBatch(campaign, BATCH_SIZE);
    return NextResponse.json({ campaign: updated ?? campaign });
  },
);
