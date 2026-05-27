import { getWhatsAppProviderAs } from "@/lib/providers/whatsapp";
import { updateWaCampaign, type WaCampaign } from "@/lib/store";

/**
 * Send the next slice of a broadcast campaign. Advances the cursor and the
 * sent/failed counters, and flips the campaign to "done" once the audience is
 * exhausted. Idempotent on a finished campaign (returns it untouched). Used by
 * both the admin send endpoint (client-driven batches) and the daily cron
 * backstop, so a campaign always finishes even if the operator closes the tab.
 */
export async function sendCampaignBatch(
  campaign: WaCampaign,
  batchSize: number,
): Promise<WaCampaign | null> {
  if (campaign.status !== "sending") return campaign;

  const provider = getWhatsAppProviderAs("system");
  const end = Math.min(campaign.cursor + batchSize, campaign.phones.length);
  let sent = campaign.sentCount;
  let failed = campaign.failedCount;

  for (let i = campaign.cursor; i < end; i++) {
    try {
      await provider.sendTemplate(campaign.phones[i], campaign.template, campaign.languageCode);
      sent++;
    } catch {
      failed++;
    }
  }

  const done = end >= campaign.phones.length;
  return updateWaCampaign(campaign.id, {
    cursor: end,
    sentCount: sent,
    failedCount: failed,
    status: done ? "done" : "sending",
    completedAt: done ? new Date().toISOString() : null,
  });
}
