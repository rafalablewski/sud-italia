import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { reconcileZones, createZone, renameZone, deleteZone } from "@/lib/store";

/**
 * Floor **zones** — first-class per-location entities (separate from tables) so
 * an empty zone persists and zones can be created / renamed / deleted
 * independently. Reading is staff-level (the Tables board + pickers need the
 * groups); mutations are manager+. Location scope is enforced by withAdmin via
 * the ?location= query param, like the sibling tables route.
 */

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    // Reconcile back-fills a zone entity for any distinct table.zone not yet
    // listed, so existing floor plans surface as managed zones.
    return NextResponse.json({ zones: await reconcileZones(locationSlug) });
  },
);

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const res = await createZone(locationSlug, String(body?.name ?? "New zone").slice(0, 60));
    if ("error" in res) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  },
);

export const PATCH = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const res = await renameZone(locationSlug, String(body.id), String(body.name ?? "").slice(0, 60));
    if ("error" in res) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  },
);

export const DELETE = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ ok: await deleteZone(locationSlug, id) });
  },
);
