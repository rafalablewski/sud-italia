import { NextResponse } from "next/server";
import { API_VERSION } from "@/lib/api/v1/envelope";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

/**
 * `GET /api/v1/openapi.json` — the machine-readable contract for the native
 * apps, GENERATED from the server Zod schemas (src/lib/api/v1/schemas.ts →
 * openapi.ts). It is the single source of truth the Swift `CoreModels` package
 * is generated from (Apple's swift-openapi-generator), so the wire types can't
 * drift from the app's models, the server's validation, or this document
 * (ARCHITECTURE §5, DECISION B).
 *
 * Served raw (not enveloped) — it's a standard OpenAPI document consumed by
 * tooling, not by app feature code.
 */
export function GET() {
  const res = NextResponse.json(buildOpenApiDocument());
  res.headers.set("X-Ottaviano-API", API_VERSION);
  res.headers.set("Cache-Control", "public, max-age=300");
  return res;
}
