import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getQrOrderingSettings,
  updateQrOrderingSettings,
  type QrOrderingSettings,
} from "@/lib/store";

// Read the QR table-ordering controls (master switch, per-location override,
// require-table, show-prices). Manager+.
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  return NextResponse.json(await getQrOrderingSettings());
});

// Toggle QR ordering on/off, per-location, and its options. Manager+.
export const PUT = withAdmin({ roles: ["manager"] }, async (req: NextRequest, _ctx, { user }) => {
  let body: Partial<QrOrderingSettings>;
  try {
    body = (await req.json()) as Partial<QrOrderingSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const before = await getQrOrderingSettings();
  const settings = await updateQrOrderingSettings(body);
  await appendAuditLog({
    actor: user.email || user.id,
    action: "qr_ordering.update",
    entityType: "qr_ordering_settings",
    before,
    after: settings,
  });
  return NextResponse.json(settings);
});
