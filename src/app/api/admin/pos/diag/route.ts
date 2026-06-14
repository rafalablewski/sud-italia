import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { withAdmin } from "@/lib/api-middleware";

/**
 * TEMPORARY diagnostic for the "voided checks reappear" investigation. Dumps
 * every pos-tabs blob in the kv_store (across namespaces + per-location + legacy)
 * with just the tab ids, so we can see exactly where a just-voided id still
 * lives. Owner-only, no-store. Remove once the root cause is confirmed.
 *
 * NB: the folder must NOT start with "_" — Next.js App Router treats `_folder`
 * as a private folder excluded from routing (a 404), so this lives at
 * /api/admin/pos/diag.
 */
export const dynamic = "force-dynamic";

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { useDB: false, note: "filesystem mode — DATABASE_URL not set" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT
      key,
      jsonb_typeof(value) AS type,
      CASE
        WHEN jsonb_typeof(value) = 'array'
        THEN (SELECT jsonb_agg(e->>'id') FROM jsonb_array_elements(value) e)
        ELSE NULL
      END AS ids
    FROM kv_store
    WHERE key LIKE '%pos-tabs%'
    ORDER BY key
  `;
  return NextResponse.json(
    { useDB: true, blobs: rows },
    { headers: { "Cache-Control": "no-store" } },
  );
});
