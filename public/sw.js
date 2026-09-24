// CarryCub service worker — shared by the customer app and the /driver app
// (same origin, one worker, scope "/").
//
//   - /api/**            -> never intercepted. Bookings/drivers/locations are
//                           live data; a stale cached response would be wrong.
//   - cross-origin       -> never intercepted (map tiles, geocoding, etc.).
//   - Next RSC / data    -> never intercepted (payloads must always be fresh).
//   - navigations        -> network-first; only good (200, same-origin) pages
//                           are cached; falls back to the cached page, then
//                           to /offline.html.
//   - manifests          -> network-first (so manifest/icon changes propagate).
//   - other same-origin  -> stale-while-revalidate (fast + offline, and it
//     GET assets            self-updates, so icon/asset changes are picked up
//                           on the next load instead of being stuck forever).

const CACHE_VERSION = "carrycub-v2";
const PRECACHE = [
  "/offline.html",
  "/manifest-customer.json",
  "/manifest-driver.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles, geocoding, etc.
  if (url.pathname.startsWith("/api/")) return; // always live
  if (
    request.headers.get("RSC") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/_next/data/")
  )
    return; // Next.js server-component / data payloads

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/offline.html"))),
    );
    return;
  }

  if (url.pathname.startsWith("/manifest")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    }),
  );
});
