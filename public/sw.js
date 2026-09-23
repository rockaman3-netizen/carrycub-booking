// CarryCub service worker — shared by the customer app and the /driver app
// (same origin, one worker, scope "/").
//
// Strategy, kept deliberately simple (no build-time precache manifest is
// available here, so this is runtime caching, not a full asset list):
//   - /api/**            -> always network. Bookings/drivers/locations are
//                           live data from Google Sheets; serving a stale
//                           cached response here would be actively wrong
//                           (e.g. showing a booking as "searching" after it
//                           was actually delivered), so this route is never
//                           intercepted.
//   - cross-origin        -> never intercepted (map tiles, geocoding, etc.)
//                           — avoids opaque-response caching pitfalls.
//   - navigations (pages) -> network-first, falling back to a cached copy
//                           of that page, and finally to offline.html if
//                           neither is available.
//   - same-origin assets  -> cache-first (JS/CSS bundles are content-hashed
//                           by Next.js, icons/manifests rarely change).

const CACHE_VERSION = "carrycub-v1";
const PRECACHE = [
  "/offline.html",
  "/manifest-customer.json",
  "/manifest-driver.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles, geocoding, etc.
  if (url.pathname.startsWith("/api/")) return; // always live

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/offline.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
