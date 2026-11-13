/* Only explicit public assets are cached. Never cache API, HTML, RSC, or learner data. */
const ROOT = new URL(self.registration.scope).pathname;
const CACHE = "everyday-english-public-v2" + (ROOT === "/" ? "" : ROOT);
const offlinePath = ROOT + "offline.html";
const PUBLIC_ASSETS = [
  "/offline.html",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/icon.svg",
].map((path) => ROOT + path.slice(1));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PUBLIC_ASSETS))
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
            .filter((key) => ROOT === "/" && key === "everyday-english-v1")
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(offlinePath)
          .then(
            (response) =>
              response || new Response("Hors connexion", { status: 503 }),
          ),
      ),
    );
  } else if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => response || fetch(event.request)),
    );
  }
});
