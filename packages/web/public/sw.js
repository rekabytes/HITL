// HITL occupant app service worker. Hand-written and dependency free.
//
// - Occupant screens (/app, /r/<code>) are network-first: always fresh online,
//   last copy offline, so a room opened before can still take a vote offline.
// - Hashed build assets (/_next/static) and icons are cache-first.
// - Anything else (staff portal, API, sensor posts) is never touched.
// - Votes are queued in the page (src/lib/vote-queue.ts), not here.
//
// Bump VERSION when this file's caching rules change.
const VERSION = "v1";
const PAGES = `hitl-pages-${VERSION}`;
const ASSETS = `hitl-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hitl-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isOccupantPage = (path) => path === "/app" || path.startsWith("/app/") || path.startsWith("/r/");
const isAsset = (path) => path.startsWith("/_next/static/") || path.startsWith("/icons/") || path === "/manifest.webmanifest";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (isOccupantPage(url.pathname)) event.respondWith(networkFirst(req));
    else if (url.pathname === OFFLINE_URL) event.respondWith(caches.match(OFFLINE_URL).then((r) => r || fetch(req)));
    return;
  }
  if (isAsset(url.pathname)) event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Only keep real pages; a redirect to /login must not be replayed offline.
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
  return res;
}
