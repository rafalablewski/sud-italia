"use client";

// Backoff schedule for transient failures (dropped connection or a 5xx). Four
// attempts total; tuned so a brief WiFi blip on a POS recovers invisibly while
// a real outage still fails in a few seconds rather than hanging the till.
const TRANSIENT_BACKOFF_MS = [400, 1200, 3000];

export interface IdempotentFetchResult {
  /** The server response, or `null` when every attempt failed to reach it. */
  res: Response | null;
  /** The idempotency key used — reuse it to retry the *same* logical action. */
  key: string;
}

/**
 * `fetch` for a money / state mutation (POS send, charge; KDS bump). It:
 *
 *  - attaches a stable `Idempotency-Key`, so the server (via `withIdempotency`)
 *    runs the mutation **at most once** no matter how many times it's retried;
 *  - retries transient failures — a dropped connection or a 5xx — with backoff,
 *    so a brief network blip recovers without the operator seeing an error or
 *    re-tapping (which is how a careless retry double-charges on a naive POS);
 *  - returns a 2xx/4xx response immediately (a 4xx is a real rejection; retrying
 *    won't help). `res` is `null` only when the server was never reached.
 *
 * Pass a `key` to retry an earlier action under its original key; omit it for a
 * fresh action (a new key is generated). **Never** reuse one key for two
 * different clicks — that would dedupe two distinct operations into one.
 */
export async function idempotentFetch(
  url: string,
  init: { method: string; body?: unknown; key?: string },
): Promise<IdempotentFetchResult> {
  const key = init.key ?? crypto.randomUUID();
  const body = init.body !== undefined ? JSON.stringify(init.body) : undefined;
  const attempts = TRANSIENT_BACKOFF_MS.length + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body,
      });
      // 5xx is the only retryable response; 2xx and 4xx are final.
      if (res.status < 500 || i === attempts - 1) return { res, key };
    } catch {
      // Network-level failure — fall through to backoff unless we're out of tries.
      if (i === attempts - 1) return { res: null, key };
    }
    await new Promise((r) => setTimeout(r, TRANSIENT_BACKOFF_MS[i]));
  }
  return { res: null, key };
}
