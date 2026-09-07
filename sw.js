/* Endurance 2026 — service worker
   HTML: network-first (a new deploy shows on the next open) · assets: stale-while-revalidate
   Bump CACHE with every release so old shells are evicted. */
const CACHE = "fuji-v11-2026-09-instrument";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/plan-spec.js",
  "./js/plan-engine.js",
  "./js/strength-program.js",
  "./js/intel.js",
  "./js/store.js",
  "./js/strava-sync.js",
  "./js/records.js",
  "./manifest.json",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(err => console.warn("[SW] precache partial:", err))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function cacheable(req, resp) {
  return !!resp && resp.status === 200 && resp.type !== "opaque" && req.url.startsWith(self.location.origin);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // weather, Strava: straight to the network
  if (url.pathname.startsWith("/api/")) { e.respondWith(fetch(req)); return; }

  // Code is network-first as well as HTML: a new index.html must never run against
  // last release's modules. The cache is the offline fallback, not the fast path.
  const isCode = /\.(js|css)$/.test(url.pathname);
  if (isCode || req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(fetch(req).then(resp => {
      if (cacheable(req, resp)) { const clone = resp.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
      return resp;
    }).catch(() => caches.match(req).then(cached => cached || (isCode ? Response.error() : caches.match("./index.html")))));
    return;
  }

  e.respondWith(caches.match(req).then(cached => {
    const fetched = fetch(req).then(resp => {
      if (cacheable(req, resp)) { const clone = resp.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
      return resp;
    }).catch(() => cached || Response.error());
    return cached || fetched;
  }));
});
