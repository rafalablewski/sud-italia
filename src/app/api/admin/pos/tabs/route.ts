import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getPosTabs, savePosTab } from "@/lib/store";

/**
 * POS open checks ("tabs"). The till's working orders, server-persisted so a
 * busy window can juggle several concurrent checks that survive a reload and
 * are shared across terminals at the same truck. GET lists this location's
 * tabs; POST opens a fresh empty one (no channel until the operator picks it).
 * Staff+, location-scoped.
 */

// Unambiguous human-readable id (no 0/O/1/I) — printed on the rail + receipts.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newTabId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const tabs = await getPosTabs(locationSlug ?? undefined);
    return NextResponse.json({ tabs });
  },
);

export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const name =
      body && typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 40)
        : "New tab";
    const tab = await savePosTab({
      id: newTabId(),
      locationSlug,
      name,
      channel: null,
      status: "open",
      items: [],
      sentKds: false,
    });
    return NextResponse.json({ tab });
  },
);
