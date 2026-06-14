/**
 * Offline outbox (m5_2 + m5_3). Queues mutating fetches that fail
 * with no-network to IndexedDB and replays them when connectivity
 * returns.
 *
 * Replay paths:
 *   1. Background Sync API — service worker fires 'sync' tagged
 *      'sud-italia-outbox' once online, then posts a message back
 *      to the page to flush.
 *   2. window 'online' event fallback for Safari + iOS.
 *
 * Idempotency is the caller's job. Checkout already accepts an
 * Idempotency-Key header (Phase 0 m0_4); the helper preserves any
 * headers the original request carried so the replay matches the
 * original write exactly.
 */

const DB_NAME = "sud-italia-outbox";
const STORE = "requests";
const DB_VERSION = 1;

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  queuedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store))
      .then((value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      })
      .catch(reject);
  });
}

export async function enqueueRequest(input: Omit<QueuedRequest, "id" | "queuedAt">): Promise<string> {
  const id = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const row: QueuedRequest = { ...input, id, queuedAt: Date.now() };
  await withStore("readwrite", (store) => {
    store.put(row);
  });
  await requestSync();
  return id;
}

export async function getQueuedCount(): Promise<number> {
  return withStore("readonly", (store) =>
    new Promise<number>((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  );
}

async function listAll(): Promise<QueuedRequest[]> {
  return withStore("readonly", (store) =>
    new Promise<QueuedRequest[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as QueuedRequest[]);
      req.onerror = () => reject(req.error);
    }),
  );
}

async function removeRequest(id: string): Promise<void> {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

export async function flushOutbox(): Promise<{ succeeded: number; failed: number }> {
  const queue = await listAll();
  let succeeded = 0;
  let failed = 0;
  for (const row of queue) {
    try {
      const res = await fetch(row.url, {
        method: row.method,
        headers: row.headers,
        body: row.body ?? undefined,
      });
      if (res.ok || res.status === 409) {
        // 409 = idempotency replay, treat as success.
        await removeRequest(row.id);
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { succeeded, failed };
}

async function requestSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) {
      await reg.sync.register("sud-italia-outbox");
    }
  } catch {
    // Safari / iOS path — fall back to window online event.
  }
}

let registered = false;

/**
 * Register the service worker and wire up the outbox flush triggers.
 * Safe to call repeatedly — guarded by a module-level flag.
 */
export function registerOfflineOutbox(): void {
  if (registered) return;
  registered = true;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // If this page is already controlled by an OLD worker, a later
  // controllerchange means a NEW worker just took over (it called
  // skipWaiting + clients.claim on activate). The page is still running the
  // previously-loaded chunks, so reload ONCE to pick up the fresh bundle —
  // this is what lets a deployed fix actually reach an already-open till
  // instead of waiting on a manual hard-refresh. Guarded so it never loops,
  // and skipped for a first-time visitor (no prior controller) whose initial
  // claim is not an update.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js")
    .then(() => {
      navigator.serviceWorker.controller?.postMessage({
        type: "sud-italia-outbox/registered",
      });
    })
    .catch(() => {
      // Service worker registration failures shouldn't block ordering.
    });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "sud-italia-outbox/flush") {
      void flushOutbox();
    }
  });

  window.addEventListener("online", () => {
    void flushOutbox();
  });
}
