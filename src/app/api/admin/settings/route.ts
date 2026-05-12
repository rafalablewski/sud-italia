import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getSettings, updateSettings } from "@/lib/store";

// Brand-level settings touch the public landing page + analytics scope.
// Reads open to any-auth; writes are owner-only.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getSettings());
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    try {
      const before = await getSettings();
      const updates = await req.json();
      const settings = await updateSettings(updates);
      await appendAuditLog({
        actor: user.email || user.id,
        action: "settings.update",
        entityType: "settings",
        before,
        after: settings,
      });
      return NextResponse.json(settings);
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);
