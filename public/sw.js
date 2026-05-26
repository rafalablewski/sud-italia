/**
 * Sud Italia service worker (m5_1 + m5_2 + m5_3).
 *
 * Caching strategy:
 *   - Static shell (HTML + manifest + icons): cache-first with a
 *     network fallback. Lets the truck operator open the kitchen
 *     board with no signal.
 *   - API GET (menu, public settings): stale-while-revalidate so the
 *     UI loads instantly off cache while a fresh copy is fetched in
 *     the background.
 *   - Everything else: network-first, falls back to cache.
 *
 * Offline outbox (m5_2): mutating fetches (POST /api/checkout,
 * /api/feedback, /api/admin/*) that fail with no-network are queued
 * to IndexedDB by the page-level helper in src/lib/offline-outbox.ts.
 * The service worker listens for a 'sync' event tagged
 * 'sud-italia-outbox' and replays queued requests when connectivity
 * returns. Where Background Sync is unavailable (Safari), the page
 * helper flushes on the 'online' event.
 *
 * Bump the version below when shipping breaking shell changes — old
 * caches are pruned on activate.
 */

const VERSION = "v3";
const STATIC_CACHE = `sud-italia-static-${VERSION}`;
const RUNTIME_CACHE = `sud-italia-runtime-${VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/admin",
  "/admin/login",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(
          STATIC_ASSETS.filter((u) => u !== "/").concat(["/"]),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const STALE_REVALIDATE = [
  "/api/settings/public",
  "/api/menu",
];

function isStaleRevalidate(url) {
  return STALE_REVALIDATE.some((path) => url.pathname.startsWith(path));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Don't try to cache cross-origin (Stripe, Sentry, etc).
  if (url.origin !== self.location.origin) return;

  if (isStaleRevalidate(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // HTML / shell.
  if (req.destination === "document") {
    // Admin surfaces: NETWORK-FIRST. A cached old page must never shadow a
    // fresh deploy (cache-first here served a stale /admin/pos after the POS
    // rewrite shipped). We still cache each ok response and fall back to it
    // when offline, so the operator board opens with no signal.
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() =>
            caches
              .match(req)
              .then((cached) => cached || caches.match("/admin") || caches.match("/")),
          ),
      );
      return;
    }
    // Customer site documents — cache-first with network fallback.
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                caches.open(STATIC_CACHE).then((cache) => cache.put(req, res.clone()));
              }
              return res;
            })
            .catch(() => caches.match("/")),
      ),
    );
    return;
  }

  // Default: network-first, cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.destination === "style" || req.destination === "script" || req.destination === "image")) {
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sud-italia-outbox") {
    event.waitUntil(flushOutbox());
  }
  if (event.tag === "sud-italia-admin-kds-queue") {
    event.waitUntil(flushAdminKdsQueue());
  }
});

async function flushOutbox() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "sud-italia-outbox/flush" });
  }
}

/** Mobile KDS offline queue replay. The page-level helper
 *  (`useOfflineQueue` in src/components/admin/v2/mobile/useOfflineQueue.ts)
 *  persists pending bumps to localStorage. When the user is offline and
 *  closes the tab, only Background Sync can replay them — we fire a
 *  message to any open client so its in-page replay loop runs. If no
 *  client is open, the queue sits and replays on the next session. */
async function flushAdminKdsQueue() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "sud-italia-admin-kds-queue/flush" });
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "sud-italia-outbox/registered") {
    // page-side helper has loaded — no-op, just acks for diagnostics.
  }
});

// Push notifications (m5_6). Payload shape comes from
// src/lib/push-notifications.ts → sendPushNotification.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Sud Italia", body: event.data.text() };
  }
  const { title, body, icon, url, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "Sud Italia", {
      body: body || "",
      icon: icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: tag || undefined,
      data: { url: url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
