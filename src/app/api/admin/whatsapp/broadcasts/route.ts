import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, createWaCampaign, getCustomers, getSettings, listWaCampaigns } from "@/lib/store";
import { AUDIENCES, isAudienceKey, selectAudience, type VipThresholds } from "@/lib/whatsapp/audience";

const MAX_AUDIENCE = 5000;

/** Operator-set VIP thresholds for the audience cut (admin → Operations). */
async function vipThresholds(): Promise<VipThresholds> {
  const m = (await getSettings()).marketing;
  return { spendGrosze: m?.vipSpendGrosze, minOrders: m?.vipMinOrders };
}

/** List campaigns + live audience counts for the composer. */
export const GET = withAdmin({ roles: ["manager", "owner"] }, async () => {
  const [campaigns, customers, vip] = await Promise.all([listWaCampaigns(), getCustomers(), vipThresholds()]);
  const audiences = AUDIENCES.map((a) => ({
    key: a.key,
    label: a.label,
    hint: a.hint,
    count: selectAudience(customers, a.key, Date.now(), vip).length,
  }));
  return NextResponse.json({ campaigns, audiences });
});

/** Create a campaign: snapshot the audience and queue it for batched sending. */
export const POST = withAdmin({ roles: ["manager", "owner"] }, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as {
    template?: unknown;
    languageCode?: unknown;
    audienceKey?: unknown;
  };
  const template = typeof body.template === "string" ? body.template.trim() : "";
  if (!template) {
    return NextResponse.json({ error: "A Meta template name is required" }, { status: 400 });
  }
  if (!isAudienceKey(body.audienceKey)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }
  const languageCode =
    typeof body.languageCode === "string" && /^[a-z]{2}(_[A-Z]{2})?$/.test(body.languageCode)
      ? body.languageCode
      : "pl";

  const [customers, vip] = await Promise.all([getCustomers(), vipThresholds()]);
  const audience = selectAudience(customers, body.audienceKey, Date.now(), vip);
  const audienceMeta = AUDIENCES.find((a) => a.key === body.audienceKey)!;
  // Dedupe phones and cap the snapshot so one blast can't be unbounded.
  const phones = Array.from(new Set(audience.map((c) => c.phone))).slice(0, MAX_AUDIENCE);

  const campaign = await createWaCampaign({
    template,
    languageCode,
    audienceKey: body.audienceKey,
    audienceLabel: audienceMeta.label,
    phones,
    createdBy: user.email || user.id,
  });

  await appendAuditLog({
    actor: user.email || user.id,
    action: "whatsapp.broadcast.create",
    entityType: "whatsapp_campaign",
    entityId: campaign.id,
    after: { template, audienceKey: body.audienceKey, audienceSize: phones.length },
  });

  return NextResponse.json({ campaign });
});
