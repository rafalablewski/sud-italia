import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { withAdmin } from "@/lib/api-middleware";
import { getActiveDataMode, getPosTabs, getPosTab, deletePosTab } from "@/lib/store";

/**
 * TEMPORARY diagnostic for the "voided checks reappear" investigation.
 *
 *  GET (no params): reports the active data mode, what getPosTabs() actually
 *  returns per location (i.e. exactly what the POS shows), and a raw dump of
 *  every pos-tabs blob in kv_store (across namespaces + per-location + legacy).
 *
 *  GET ?void=<id>: runs the REAL server-side deletePosTab(id) and reports the
 *  id's presence in every blob BEFORE and AFTER, plus the function's return —
 *  the definitive test of whether the delete path works and which blob it hits.
 *
 * Owner-only, no-store. Remove once the root cause is confirmed.
 *
 * NB: the folder must NOT start with "_" — Next.js treats `_folder` as private
 * (excluded from routing), so this lives at /api/admin/pos/diag.
 */
export const dynamic = "force-dynamic";

async function dumpBlobs() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql`
    SELECT key,
      CASE WHEN jsonb_typeof(value) = 'array'
        THEN (SELECT jsonb_agg(e->>'id') FROM jsonb_array_elements(value) e)
        ELSE NULL END AS ids
    FROM kv_store WHERE key LIKE '%pos-tabs%' ORDER BY key
  `;
}

export const GET = withAdmin({ roles: ["owner"] }, async (req) => {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { useDB: false, note: "filesystem mode — DATABASE_URL not set" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const mode = await getActiveDataMode();
  const voidId = req.nextUrl.searchParams.get("void");

  if (voidId) {
    const before = await dumpBlobs();
    const tab = await getPosTab(voidId).catch(() => undefined);
    const removed = await deletePosTab(voidId, tab?.locationSlug);
    const after = await dumpBlobs();
    return NextResponse.json(
      { mode, voidId, foundTabLocation: tab?.locationSlug ?? null, deletePosTabReturned: removed, before, after },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const sql = neon(process.env.DATABASE_URL!);
  const [krakow, warszawa, blobs, dbg] = await Promise.all([
    getPosTabs("krakow"),
    getPosTabs("warszawa"),
    dumpBlobs(),
    sql`SELECT value FROM kv_store WHERE key = 'pos-void-debug'`.then((r) => r[0]?.value ?? null).catch(() => null),
  ]);
  return NextResponse.json(
    {
      useDB: true,
      mode,
      // What the actual DELETE route last recorded (the void button's decision).
      lastVoidRoute: dbg,
      // What the POS actually shows (id + which check), so we can see which blob
      // these came from by cross-referencing the raw dump below.
      posShows: {
        krakow: krakow.map((t) => ({ id: t.id, name: t.name, loc: t.locationSlug })),
        warszawa: warszawa.map((t) => ({ id: t.id, name: t.name, loc: t.locationSlug })),
      },
      blobs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
