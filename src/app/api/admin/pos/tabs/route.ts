import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getPosTabs, getPosTab, savePosTab, deletePosTab } from "@/lib/store";

/**
 * POS open checks (tabs) — the server-backed working state for the Tabs POS.
 * Several concurrent checks per till, persisted so they survive a refresh and
 * are shared across tills at one truck. Lines carry menu-item ids + quantities
 * only; prices + discounts are resolved server-side at send/charge time (see
 * ../orders), so the till never dictates what an item costs.
 *
 * Staff+, location-scoped by withAdmin via ?location=.
 *
 *   GET    → list this location's open checks
 *   POST   → start a new (empty) check
 *   PUT    → upsert an edited check (items / channel / table / covers / address)
 *   DELETE → drop a check (?id=)
 */

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json({ tabs: await getPosTabs(locationSlug ?? undefined) });
  },
);

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const name =
      typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "New tab";
    const tab = await savePosTab({ locationSlug, name, status: "open", items: [] });
    return NextResponse.json({ tab });
  },
);

export const PUT = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.id !== "string") {
      return NextResponse.json({ error: "Tab id required" }, { status: 400 });
    }
    // Scope the write to the caller's truck — a till can't hijack or overwrite
    // another location's open check by passing its id.
    const existing = await getPosTab(body.id, locationSlug);
    if (existing && existing.locationSlug !== locationSlug) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    }
    // savePosTab sanitises lines/channel/status and preserves the server-owned
    // orderId — so a stray "pay" status or order link can't be forged here.
    // `mustExist` makes a PUT an EDIT, never a create: an edit aimed at a check
    // that was just voided is dropped (404) instead of resurrecting it. Only
    // POST opens a check. This is the fix for voided checks reappearing — a
    // debounced PUT that lands a beat after the DELETE used to re-insert the row.
    const tab = await savePosTab(
      {
        id: body.id,
        locationSlug,
        name: body.name,
        channel: body.channel ?? null,
        status: body.status,
        items: body.items,
        tableId: body.tableId,
        covers: body.covers,
        address: body.address,
        customerPhone: body.customerPhone,
        customerName: body.customerName,
        // null = explicit clear (a full-tab PUT can't send `undefined`).
        discount: body.discount,
        sentKds: body.sentKds,
        coursed: body.coursed === null ? undefined : body.coursed,
      },
      { mustExist: true },
    );
    if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    return NextResponse.json({ tab });
  },
);

export const DELETE = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Scope the delete to the caller's truck — a till can't drop another
    // location's open check by guessing its id.
    const tab = await getPosTab(id, locationSlug ?? undefined);
    if (!tab || (locationSlug && tab.locationSlug !== locationSlug)) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    }
    const ok = await deletePosTab(id, tab.locationSlug);
    if (!ok) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  },
);
