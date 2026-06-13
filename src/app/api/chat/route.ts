import { NextRequest, NextResponse } from "next/server";
import { getChatResponse } from "@/lib/ai-engine";

/**
 * Public chat FAQ endpoint backing the storefront ChatWidget. The response is
 * built server-side so the bot's hours, delivery gate, addresses, loyalty
 * ladder and brand name come from live admin settings (not a stale literal) —
 * and so the store reads stay out of the client bundle (Rule #3).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message : "";
  const response = await getChatResponse(message);
  return NextResponse.json({ response });
}
