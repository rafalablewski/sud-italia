import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getMenuOverrides, setMenuOverride, setMenuOverridesBulk, type MenuOverride } from "@/lib/store";
import { getMenu } from "@/data/menus";
import { locations } from "@/data/locations";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const locationSlug = req.nextUrl.searchParams.get("location");
  const overrides = await getMenuOverrides();

  if (locationSlug) {
    const base = getMenu(locationSlug);
    const merged = base.map((item) => ({
      ...item,
      ...overrides[item.id],
      _hasOverride: !!overrides[item.id],
    }));
    return NextResponse.json(merged);
  }

  // Return all locations' menus
  const active = locations.filter((l) => l.isActive);
  const result: Record<string, unknown[]> = {};
  for (const loc of active) {
    const base = getMenu(loc.slug);
    result[loc.slug] = base.map((item) => ({
      ...item,
      ...overrides[item.id],
      _hasOverride: !!overrides[item.id],
    }));
  }
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();

    // Bulk update: { items: { [id]: override } }
    if (body.items && typeof body.items === "object") {
      await setMenuOverridesBulk(body.items as Record<string, MenuOverride>);
      return NextResponse.json({ success: true });
    }

    // Single update: { id, ...override }
    const { id, ...override } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing item id" }, { status: 400 });
    }

    await setMenuOverride(id, override as MenuOverride);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
