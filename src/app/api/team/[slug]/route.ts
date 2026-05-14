import { NextRequest, NextResponse } from "next/server";
import { getPublicTeamRollup } from "@/lib/store";

/**
 * Public team rollup (audit §3.4) — exposed at /api/team/[slug].
 *
 * Returns member count, this-month team pool, and the head's accrued
 * bonus points. Used by the public /team/[slug] landing page to render the
 * "Lunch for Acme" hero stats and by the cart drawer banner to confirm
 * the team is live before showing the "Ordering with Acme" copy.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rollup = await getPublicTeamRollup(slug);
  if (!rollup) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json(rollup);
}
