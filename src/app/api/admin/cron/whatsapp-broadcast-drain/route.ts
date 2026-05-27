import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { listWaCampaigns } from "@/lib/store";
import { sendCampaignBatch } from "@/lib/whatsapp/broadcast";

/**
 * Backstop for broadcast campaigns left mid-send (e.g. the operator closed the
 * tab before the client-driven batches finished). Drains a capped slice of
 * each still-"sending" campaign so nothing stalls forever. The admin UI remains
 * the primary, faster driver.
 */
const DRAIN_PER_CAMPAIGN = 200;

export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const campaigns = (await listWaCampaigns()).filter((c) => c.status === "sending");
  let drained = 0;
  let sent = 0;
  for (const c of campaigns) {
    const updated = await sendCampaignBatch(c, DRAIN_PER_CAMPAIGN);
    drained++;
    if (updated) sent += updated.sentCount - c.sentCount;
  }

  logCronRun("whatsapp-broadcast-drain", { campaigns: campaigns.length, drained, sent });
  return NextResponse.json({ ok: true, campaigns: campaigns.length, drained, sent });
}
