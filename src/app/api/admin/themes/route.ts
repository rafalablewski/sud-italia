import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getThemeSkinSettings, updateThemeSkinSettings } from "@/lib/store";
import { userHasPermission } from "@/lib/permissions";
import { isValidSkin, THEME_SURFACES, type ThemeSkinSettings, type ThemeSurface } from "@/lib/theme-skins";

// DB-global active theme-skin per surface (homepage / admin / core). The
// Settings → Themes picker reads + writes this. A skin swap repaints the
// public storefront + every operator surface, so writes are owner-gated and
// audited, same as brand-level Settings. See src/lib/theme-skins.ts.

export const GET = withAdmin({}, async () => {
  return NextResponse.json(await getThemeSkinSettings());
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Expected an object of { surface: skinId }" }, { status: 400 });
    }

    // Accept only known surfaces with valid skin ids; reject unknown skins so a
    // typo can't park a surface on a missing stylesheet.
    const raw = body as Record<string, unknown>;
    const updates: Partial<ThemeSkinSettings> = {};
    for (const surface of THEME_SURFACES) {
      const value = raw[surface];
      if (value === undefined) continue;
      if (typeof value !== "string" || !isValidSkin(surface as ThemeSurface, value)) {
        return NextResponse.json(
          { error: `Unknown skin "${String(value)}" for surface "${surface}"` },
          { status: 400 },
        );
      }
      updates[surface as ThemeSurface] = value;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid surface updates supplied" }, { status: 400 });
    }

    const before = await getThemeSkinSettings();
    const after = await updateThemeSkinSettings(updates);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "settings.theme-skin.update",
      entityType: "settings",
      before,
      after,
    });
    return NextResponse.json(after);
  },
);
