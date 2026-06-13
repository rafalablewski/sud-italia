import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { deleteRunSheet, getRunSheets, saveRunSheet } from "@/lib/store";

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getRunSheets(locationSlug ?? undefined));
  },
);

async function upsertRoute(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.locationSlug) {
      return NextResponse.json({ error: "name + locationSlug required" }, { status: 400 });
    }
    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }
    const saved = await saveRunSheet({
      id: body.id,
      name: body.name.trim(),
      locationSlug: body.locationSlug,
      description: body.description,
      stops: Array.isArray(body.stops) ? body.stops : [],
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertRoute(req),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsertRoute(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteRunSheet(id);
    return NextResponse.json({ ok });
  },
);
