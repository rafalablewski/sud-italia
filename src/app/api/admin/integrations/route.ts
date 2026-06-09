import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getIntegrationSettings,
  updateIntegrationSettings,
  type IntegrationSettings,
} from "@/lib/store";

// Read the delivery-marketplace connection registry. Manager+; no provider
// secrets are stored here (marketplace API keys live in the provider's own
// dashboard / env), so this is safe to read for any back-office operator.
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  return NextResponse.json(await getIntegrationSettings());
});

// Connect / disconnect / configure a marketplace, or toggle enablement.
// Accepts a partial `connections` list — each entry is patched over the
// stored value, so a single-provider "connect" and a full save both work.
export const PUT = withAdmin({ roles: ["manager"] }, async (req: NextRequest, _ctx, { user }) => {
  let body: Partial<IntegrationSettings>;
  try {
    body = (await req.json()) as Partial<IntegrationSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const before = await getIntegrationSettings();
  const settings = await updateIntegrationSettings(body);
  await appendAuditLog({
    actor: user.email || user.id,
    action: "integrations.update",
    entityType: "integration_settings",
    before,
    after: settings,
  });
  return NextResponse.json(settings);
});
