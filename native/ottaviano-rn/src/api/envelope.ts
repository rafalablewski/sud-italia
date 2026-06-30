/**
 * The `/api/v1` response envelope (docs/native/API-V1.md). Every endpoint returns
 * exactly one of these shapes; apps branch on `error.code`, never the message.
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal"
  | "network";

export interface ApiMeta {
  nextCursor?: string;
  deprecation?: string;
  idempotent?: boolean;
  [k: string]: unknown;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: unknown;
  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
  get isUnauthorized() {
    return this.code === "unauthorized";
  }
}
