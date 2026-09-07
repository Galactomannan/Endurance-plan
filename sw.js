/* James Endurance Plan 2026 — Service Worker
   Strategy:
   - HTML navigations  → network-first (so a fresh deploy is seen on first reload)
   - Other GET assets  → stale-while-revalidate (fast, self-healing)
   - Offline fallback  → cached index.html

   Bump CACHE whenever you ship a new index.html so old shells are evicted. */

const CACHE = "fuji-v9-2026-09-rebuild";
const ASSETS = [
  "./",
  "./index.html",
  "./js/plan-spec.js",
  "./js/plan-engine.js",
  "./js/strength-program.js",
  "./js/intel.js",
  "./assets/fuji-kawaguchi.jpg",
  "./assets/fuji-kawaguchi-960.jpg",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(err => {
      console.warn("[SW] precache partial:", err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCacheable(req, resp) {
  if (!resp || resp.status !== 200 || resp.type === "opaque") return false;
  return req.url.startsWith(self.location.origin) || req.url.includes("cdnjs.cloudflare.com");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache authenticated API responses.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(req));
    return;
  }

  // Network-first for navigations / HTML so users see new versions immediately.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req).then(resp => {
        if (isCacheable(req, resp)) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() =>
        caches.match(req).then(cached => cached || caches.match("./index.html"))
      )
    );
    return;
  }

  // Stale-while-revalidate for everything else.
  e.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req).then(resp => {
        if (isCacheable(req, resp)) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => cached); // offline: return cached if we have it
      return cached || fetched;
    })
  );
});
