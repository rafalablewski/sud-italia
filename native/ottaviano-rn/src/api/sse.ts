import { apiUrl } from "./config";

/**
 * Bearer-authenticated SSE reader for React Native.
 *
 * The web `EventSource` can't set an `Authorization` header, and RN's `fetch`
 * doesn't expose a reliable streaming body — but `XMLHttpRequest` delivers the
 * response incrementally via `readyState === LOADING`, so we parse the growing
 * `responseText` for `data:` frames ourselves. This is exactly how the native
 * KDS/Orders board consumes `/orders/stream` and the customer tracker consumes
 * `/customer/orders/:id/stream` (API-V1.md "realtime spine"): one long-lived
 * connection, auto-reconnecting with backoff, emitting each `data:` JSON frame.
 */

export interface SSEHandle {
  close: () => void;
}

interface SSEOptions<T> {
  path: string;
  token?: string | null;
  onMessage: (data: T) => void;
  onError?: (e: unknown) => void;
  onOpen?: () => void;
}

export function openSSE<T = unknown>(opts: SSEOptions<T>): SSEHandle {
  let closed = false;
  let xhr: XMLHttpRequest | null = null;
  let retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    let cursor = 0;
    let buffer = "";
    xhr = new XMLHttpRequest();
    xhr.open("GET", apiUrl(opts.path), true);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    if (opts.token) xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);

    const drain = () => {
      const text = xhr?.responseText ?? "";
      if (text.length <= cursor) return;
      buffer += text.slice(cursor);
      cursor = text.length;
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        if (payload === "" || payload === "[DONE]") continue;
        try {
          opts.onMessage(JSON.parse(payload) as T);
          retry = 0; // a good frame resets backoff
        } catch {
          /* keep-alive / ping frame — ignore */
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (!xhr) return;
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && xhr.status === 200) opts.onOpen?.();
      if (xhr.readyState === XMLHttpRequest.LOADING) drain();
      if (xhr.readyState === XMLHttpRequest.DONE) {
        drain();
        if (!closed) scheduleReconnect(xhr.status === 0 ? "network" : `status ${xhr.status}`);
      }
    };
    xhr.onerror = () => {
      if (!closed) {
        opts.onError?.(new Error("SSE connection error"));
        scheduleReconnect("error");
      }
    };
    try {
      xhr.send();
    } catch (e) {
      if (!closed) scheduleReconnect(e);
    }
  };

  const scheduleReconnect = (_reason: unknown) => {
    if (closed || reconnectTimer) return;
    retry = Math.min(retry + 1, 6);
    const delay = Math.min(1000 * 2 ** (retry - 1), 15000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        xhr?.abort();
      } catch {
        /* already done */
      }
      xhr = null;
    },
  };
}
