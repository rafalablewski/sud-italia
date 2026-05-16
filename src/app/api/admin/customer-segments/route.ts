import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getSegmentCounts,
  rebuildAllCustomerSegments,
} from "@/lib/customer-segments";

/**
 * Read the current segment mix (counts per segment) for the dashboard
 * tile. POST triggers an on-demand rebuild — operator-initiated, for
 * the "rescan now" button on /admin/customers.
 */
export const GET = withAdmin(
  { roles: ["manager"] },
  async () => {
    const counts = await getSegmentCounts();
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return NextResponse.json({ total, counts });
  },
);

export const POST = withAdmin(
  { roles: ["owner"] },
  async () => {
    const result = await rebuildAllCustomerSegments();
    return NextResponse.json({ ok: true, ...result });
  },
);
