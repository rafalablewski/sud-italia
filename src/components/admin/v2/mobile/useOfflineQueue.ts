"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string;
  enqueuedAt: number;
  attempts: number;
}

interface QueueOptions {
  /** localStorage key. Buckets per page (kds, orders, etc.). */
  storageKey: string;
  /** Max attempts before discarding. Default 5. */
  maxAttempts?: number;
}

/**
 * Tiny offline mutation queue. Uses localStorage (not IndexedDB) because:
 *   – KDS / order mutations are ≤ 200 bytes — localStorage's 5 MB budget
 *     fits ~25,000 queued events,
 *   – synchronous reads simplify the "should I enqueue?" decision path,
 *   – IndexedDB's open/transact dance adds 30+ LOC for no benefit at our
 *     queue size.
 *
 * On reconnect (`window.online` event) the hook drains the queue in order.
 * On failure it backs the request off (increment attempts) and retries on
 * the next online or 30s tick.
 */
export function useOfflineQueue({ storageKey, maxAttempts = 5 }: QueueOptions) {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(0);
  const draining = useRef(false);

  const read = useCallback((): QueuedRequest[] => {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as QueuedRequest[]) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const write = useCallback(
    (rows: QueuedRequest[]) => {
      if (typeof localStorage === "undefined") return;
      try {
        if (rows.length === 0) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(rows));
      } catch {
        /* storage full or blocked — non-fatal */
      }
      setPending(rows.length);
    },
    [storageKey],
  );

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      let queue = read();
      while (queue.length > 0) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        const head = queue[0];
        try {
          const r = await fetch(head.url, {
            method: head.method,
            headers: { "Content-Type": "application/json" },
            body: head.body,
          });
          if (r.ok) {
            // Drop the head, keep going.
            queue = queue.slice(1);
            write(queue);
          } else if (r.status >= 500) {
            // Server problem — back off, leave at head, retry later.
            head.attempts += 1;
            if (head.attempts >= maxAttempts) {
              queue = queue.slice(1);
            }
            write(queue);
            break;
          } else {
            // 4xx — request is rejected; do not retry forever.
            queue = queue.slice(1);
            write(queue);
          }
        } catch {
          // Network error — wait for the next online event.
          break;
        }
      }
    } finally {
      draining.current = false;
    }
  }, [read, write, maxAttempts]);

  // Initial pending count + online listeners.
  useEffect(() => {
    setPending(read().length);
    const goOn = () => {
      setOnline(true);
      void drain();
    };
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    const ticker = window.setInterval(() => {
      if (navigator.onLine) void drain();
    }, 30_000);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
      window.clearInterval(ticker);
    };
  }, [drain, read]);

  /**
   * Try to send `init` immediately; if offline or network fails, queue
   * it for later replay. Returns true if delivered live, false if queued.
   */
  const send = useCallback(
    async (
      url: string,
      init: { method: string; body: string },
    ): Promise<boolean> => {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const r = await fetch(url, {
            method: init.method,
            headers: { "Content-Type": "application/json" },
            body: init.body,
          });
          if (r.ok) return true;
          if (r.status >= 500) {
            // server-side — queue & try again later
          } else {
            // 4xx — do not queue, surface to caller
            return false;
          }
        } catch {
          // Fall through to queueing.
        }
      }
      const row: QueuedRequest = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        method: init.method,
        body: init.body,
        enqueuedAt: Date.now(),
        attempts: 0,
      };
      const next = [...read(), row];
      write(next);
      return false;
    },
    [read, write],
  );

  return { online, pending, send, drain };
}
