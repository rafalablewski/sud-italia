import { NextResponse, type NextRequest } from "next/server";
import {
  CONCIERGE_CAPABILITY_IDS,
  logAgentCall,
  type ConciergeCapabilityId,
} from "@/lib/store";
import {
  CAPABILITY_META,
  buildCapabilityResponse,
  isCapabilityExposed,
} from "@/lib/concierge/capabilities";

// Public, read-only agent capability endpoint — the live data an AI assistant
// (ChatGPT / Claude / Perplexity over MCP) or any HTTP agent reads. Backed by
// the same menu / availability / allergen / location data the customer site
// serves, so nothing private is exposed. Each capability is gated by the
// operator's exposure toggle (/core/guest/concierge); flipping it off returns 403.

const ACTIVE = new Set(["krakow", "warszawa"]);

function isCapabilityId(v: string): v is ConciergeCapabilityId {
  return (CONCIERGE_CAPABILITY_IDS as readonly string[]).includes(v);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ capability: string }> },
) {
  const started = Date.now();
  const { capability } = await ctx.params;
  if (!isCapabilityId(capability)) {
    return NextResponse.json({ error: "Unknown capability" }, { status: 404 });
  }
  // Log real usage for the Concierge inspector telemetry (Rule #1). Fire-and-
  // forget so it never adds latency or fails the request; ok = 2xx served.
  const track = (ok: boolean) => { void logAgentCall({ capability, latencyMs: Date.now() - started, ok }); };

  const meta = CAPABILITY_META[capability];
  if (meta.transport !== "public") {
    track(false);
    return NextResponse.json(
      {
        error: "Not exposed over the read endpoint",
        transport: "conversational",
        note: "Ordering and payment run through the WhatsApp channel + web checkout.",
      },
      { status: 405 },
    );
  }

  if (!(await isCapabilityExposed(capability))) {
    track(false);
    return NextResponse.json(
      { error: "Capability disabled by operator", capability },
      { status: 403 },
    );
  }

  const slug = (req.nextUrl.searchParams.get("location") || "krakow").toLowerCase();
  if (!ACTIVE.has(slug)) {
    track(false);
    return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  }

  const data = await buildCapabilityResponse(capability, slug);
  track(true);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
