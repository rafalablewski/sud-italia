import { NextResponse } from "next/server";

/**
 * The single response envelope for the native `/api/v1` facade.
 *
 * Every v1 endpoint returns exactly one of:
 *   success → { data, meta? }
 *   failure → { error: { code, message, details? } }
 *
 * Why an envelope (vs the existing routes' ad-hoc `{ error: "..." }`):
 *   - a native binary lives in the App Store for weeks; it needs ONE shape it
 *     can decode generically, with a stable machine-readable `code` to branch on
 *     (not a localized string);
 *   - it carries `meta` for cursors/deprecation without changing call sites;
 *   - it is the firewall behind which the backend can move off Vercel (see
 *     docs/native/ARCHITECTURE.md §2.1) — the apps couple to this, nothing else.
 *
 * Versioning: additive-only within v1. A breaking change mints /api/v2. The
 * version is echoed in `X-Ottaviano-API` so clients/telemetry can see it.
 */

export const API_VERSION = "v1" as const;

/** Machine-readable error codes — stable contract; apps switch on these. */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal"
  | "service_unavailable";

const STATUS_FOR: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  validation_failed: 422,
  internal: 500,
  service_unavailable: 503,
};

export interface ApiMeta {
  /** Opaque pagination cursor, when the endpoint paginates. */
  nextCursor?: string;
  /** Set when the caller used a version that is scheduled for removal. */
  deprecation?: string;
  [key: string]: unknown;
}

function withVersionHeader(res: NextResponse): NextResponse {
  res.headers.set("X-Ottaviano-API", API_VERSION);
  return res;
}

/** Success envelope → 200 (override via `status` for 201 etc.). */
export function apiOk<T>(data: T, meta?: ApiMeta, status = 200): NextResponse {
  return withVersionHeader(
    NextResponse.json(meta ? { data, meta } : { data }, { status }),
  );
}

/** Error envelope; status is derived from the code unless overridden. */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  statusOverride?: number,
): NextResponse {
  return withVersionHeader(
    NextResponse.json(
      { error: { code, message, ...(details !== undefined ? { details } : {}) } },
      { status: statusOverride ?? STATUS_FOR[code] },
    ),
  );
}
