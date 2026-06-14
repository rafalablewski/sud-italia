import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { withAdmin } from "@/lib/api-middleware";
import { getPosTabs, getPosTab, savePosTab, deletePosTab, getActiveDataMode } from "@/lib/store";

/** TEMPORARY: record what the DELETE route resolved/did, so /api/admin/pos/diag
 *  can read it back (mobile-friendly). Reveals whether the void route resolves a
 *  different data mode/namespace than the reads. Best-effort; remove with the
 *  diagnostic. Written to an UN-namespaced key so the diag can read it in any
 *  mode. */
async function recordVoidDebug(entry: Record<string, unknown>): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO kv_store (key, value)
      VALUES ('pos-void-debug', ${JSON.stringify({ at: new Date().toISOString(), ...entry })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  } catch {
    /* best-effort */
  }
}

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

// This is a live till read polled every few seconds — it must NEVER be cached.
// A cached GET (Vercel CDN edge or the browser's HTTP cache, which can serve a
// response with no Cache-Control heuristically) returns a pre-void snapshot, and
// the client's merge then restores every check the operator just voided — the
// "voided checks reappear, whole set comes back to the original total" bug. Force
// the route dynamic and stamp an explicit no-store on the body.
export const dynamic = "force-dynamic";

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(
      { tabs: await getPosTabs(locationSlug ?? undefined) },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
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
    const mode = await getActiveDataMode().catch(() => "?");
    const tab = await getPosTab(id, locationSlug ?? undefined);
    if (!tab || (locationSlug && tab.locationSlug !== locationSlug)) {
      await recordVoidDebug({ id, locationSlug, mode, found: !!tab, tabLoc: tab?.locationSlug ?? null, result: "404-not-found" });
      return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    }
    const ok = await deletePosTab(id, tab.locationSlug);
    await recordVoidDebug({ id, locationSlug, mode, found: true, tabLoc: tab.locationSlug, deleted: ok, result: ok ? "ok" : "404-delete-false" });
    if (!ok) return NextResponse.json({ error: "Tab not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  },
);
