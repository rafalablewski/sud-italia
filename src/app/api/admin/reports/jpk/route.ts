import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog } from "@/lib/store";
import { buildJpkV7m, summarizeJpk } from "@/lib/jpk";

/**
 * JPK_V7M XML export endpoint. Two modes:
 *   - `?format=summary` returns a JSON preview (row count + totals) so the
 *     admin UI can show what the file will contain before downloading.
 *   - default (no `format` param) streams the XML with a sensible filename.
 *
 * Inputs:
 *   - `from`, `to` — ISO timestamps. The accountant typically wants exactly
 *     one calendar month at a time, but the endpoint accepts any range.
 *   - `location` — optional; omit for chain-wide.
 *
 * Polish tax-law context lives in `src/lib/jpk.ts`.
 *
 * Manager+ — JPK exports contain full revenue + customer phone data and
 * get sent to the tax authority.
 */
export const GET = withAdmin(
  { roles: ["manager", "owner"], locationParam: "location" },
  async (req, _ctx, { locationSlug, user }) => {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const location = locationSlug ?? undefined;
    const format = req.nextUrl.searchParams.get("format");

    if (!from || !to) {
      return NextResponse.json({ error: "from + to required (ISO)" }, { status: 400 });
    }
    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    if (format === "summary") {
      const summary = await summarizeJpk(from, to, location);
      return NextResponse.json({ from, to, location: location ?? null, ...summary });
    }

    const xml = await buildJpkV7m(from, to, location);

    await appendAuditLog({
      actor: user.email || user.id,
      action: "reports.jpk_export",
      entityType: "report",
      entityId: `jpk_v7m-${from.slice(0, 10)}-${to.slice(0, 10)}`,
      after: { from, to, location, bytes: xml.length },
    });

    const filename = `JPK_V7M_${(location || "all").toLowerCase()}_${from.slice(0, 10)}_${to.slice(0, 10)}.xml`;
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
