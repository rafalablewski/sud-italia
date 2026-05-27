import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  CONCIERGE_CAPABILITY_IDS,
  getConciergeSettings,
  updateConciergeSettings,
  type ConciergeCapabilityId,
} from "@/lib/store";

function isCapabilityId(v: unknown): v is ConciergeCapabilityId {
  return typeof v === "string" && (CONCIERGE_CAPABILITY_IDS as readonly string[]).includes(v);
}

export const GET = withAdmin({ roles: ["manager", "owner"] }, async () => {
  return NextResponse.json(await getConciergeSettings());
});

// Flip a capability's exposure. Persists immediately (toggle = saved) — the
// public /api/agent endpoint reads the same store, so the change is live at once.
export const PATCH = withAdmin({ roles: ["manager", "owner"] }, async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    capability?: unknown;
    exposed?: unknown;
  };
  if (!isCapabilityId(body.capability) || typeof body.exposed !== "boolean") {
    return NextResponse.json({ error: "capability + exposed required" }, { status: 400 });
  }
  const settings = await updateConciergeSettings({
    exposure: { [body.capability]: body.exposed },
  });
  return NextResponse.json(settings);
});
