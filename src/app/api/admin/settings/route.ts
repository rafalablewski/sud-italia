import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getSettings, updateSettings } from "@/lib/store";
import { parseBody, settingsUpdateSchema } from "@/lib/api-schemas";
import { userHasPermission } from "@/lib/permissions";

// Brand-level settings touch the public landing page + analytics scope.
// Reads open to any-auth; writes are owner-only.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getSettings());
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    if (!userHasPermission(user, "settings.edit")) {
      return NextResponse.json(
        { error: "Requires permission settings.edit" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(req, settingsUpdateSchema);
    if ("error" in parsed) return parsed.error;
    const before = await getSettings();
    const settings = await updateSettings(parsed.data);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "settings.update",
      entityType: "settings",
      before,
      after: settings,
    });
    return NextResponse.json(settings);
  },
);
