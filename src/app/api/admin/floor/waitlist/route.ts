import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getWaitlist, addWaitlistEntry, updateWaitlistEntry, removeWaitlistEntry } from "@/lib/store";
import { TABLE_FEATURES, type TableFeature, type WaitlistStatus } from "@/data/types";

/**
 * Waitlist — the host's queue of walk-in parties waiting for a table (concept 5's
 * Waitlist column). GET lists a day's queue; POST adds a party with the wait we
 * quoted them; PATCH transitions one (waiting → seated / left); DELETE removes.
 * Staff+ (a service-floor act), location-scoped.
 *
 * GET/POST /api/admin/floor/waitlist?location=&date=  ·  PATCH/DELETE …&id=
 */
const STATUSES: WaitlistStatus[] = ["waiting", "seated", "left"];

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const date = req.nextUrl.searchParams.get("date") || undefined;
    return NextResponse.json({ waitlist: await getWaitlist(locationSlug, date) });
  },
);

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const customerName = String(body.customerName ?? "").trim();
    const partySize = Number(body.partySize);
    const date = String(body.date ?? "").trim();
    if (!customerName) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
      return NextResponse.json({ error: "Party size 1–50" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    const needs = Array.isArray(body.needs)
      ? (body.needs.filter((n: unknown) => TABLE_FEATURES.includes(n as TableFeature)) as TableFeature[]).slice(0, 3)
      : [];
    const entry = await addWaitlistEntry(locationSlug, {
      date,
      customerName,
      partySize: Math.round(partySize),
      customerPhone: body.customerPhone ? String(body.customerPhone).trim() : undefined,
      notes: body.notes ? String(body.notes).trim() : undefined,
      needs: needs.length ? needs : undefined,
      quotedMin: Number.isFinite(Number(body.quotedMin)) ? Math.max(0, Math.round(Number(body.quotedMin))) : 0,
    });
    return NextResponse.json({ entry });
  },
);

export const PATCH = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const status = STATUSES.includes(body.status) ? (body.status as WaitlistStatus) : undefined;
    const entry = await updateWaitlistEntry(locationSlug, id, { status });
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry });
  },
);

export const DELETE = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ ok: await removeWaitlistEntry(locationSlug, id) });
  },
);
