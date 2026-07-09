import { apiUrl } from "./config";
import { ApiError, type ApiMeta, type ApiSuccess, type ApiErrorBody } from "./envelope";

/**
 * The thin HTTP client for `/api/v1`. Sends/receives the single envelope, surfaces
 * `error.code` as a typed `ApiError`, and attaches the Bearer access token when
 * given. Refresh-on-401 lives in the session contexts (they own the token pair):
 * they call `apiRequest`, and on `unauthorized` rotate the refresh token and
 * retry once. Money on the wire is grosze; never sent or trusted as a client total.
 */

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opts.headers,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const method = opts.method ?? "GET";
  console.warn(`[api] → ${method} ${path}${opts.token ? " (auth)" : ""}`);
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    console.warn(`[api] ✗ ${method} ${path} — network: ${e instanceof Error ? e.message : String(e)}`);
    throw new ApiError("network", e instanceof Error ? e.message : "Network request failed", 0);
  }
  console.warn(`[api] ← ${res.status} ${method} ${path}`);

  // 204 / empty body — return undefined data.
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError("internal", `Malformed response (${res.status})`, res.status);
    }
  }

  if (!res.ok || (json && typeof json === "object" && "error" in json)) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.code ?? "internal",
      err?.message ?? `Request failed (${res.status})`,
      res.status,
      err?.details,
    );
  }

  const ok = json as ApiSuccess<T> | null;
  return { data: (ok?.data as T) ?? (undefined as T), meta: ok?.meta };
}
