import { NextRequest, NextResponse } from "next/server";
import { getPublicCorporateRollup } from "@/lib/store";

/**
 * Public corporate rollup (audit §3.4) — exposed at /api/corporate/[slug].
 *
 * Returns member count, this-month corporate pool, and the company head's
 * accrued bonus points. Used by the public /corporate/[slug] landing page
 * to render the "Lunch for [company]" hero stats and by the cart drawer
 * banner to confirm the corporate account is live before showing the
 * "Ordering with [company]" copy.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rollup = await getPublicCorporateRollup(slug);
  if (!rollup) return NextResponse.json({ error: "Corporate account not found" }, { status: 404 });
  return NextResponse.json(rollup);
}
