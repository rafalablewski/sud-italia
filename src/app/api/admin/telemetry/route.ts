import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";

interface TelemetryPayload {
  span?: string;
  durationMs?: number;
  ts?: string;
  extras?: Record<string, unknown>;
}

/**
 * Best-effort operator-action telemetry sink. The client posts via
 * `navigator.sendBeacon`, so the body must be JSON and the response is
 * essentially ignored. We log to the structured logger and bail on any
 * malformed payload — never block, never throw, never store unbounded.
 *
 * Auth: requires an admin session, but doesn't gate on role — telemetry
 * is value-additive regardless of who's logged in. Body cap is 4 KiB
 * to avoid being weaponized as an abuse vector.
 */
const MAX_BYTES = 4096;

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: true });
  }
  let body: TelemetryPayload;
  try {
    body = JSON.parse(raw) as TelemetryPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (typeof body.span !== "string" || typeof body.durationMs !== "number") {
    return NextResponse.json({ ok: true });
  }
  if (body.durationMs < 0 || body.durationMs > 10 * 60 * 1000) {
    return NextResponse.json({ ok: true });
  }
  logger.info("admin.telemetry", {
    span: body.span,
    durationMs: body.durationMs,
    ts: body.ts,
    extras: body.extras,
  });
  return NextResponse.json({ ok: true });
}
