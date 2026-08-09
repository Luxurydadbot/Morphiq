/*
 * Hypergentiq service worker.
 *
 * WHAT THIS DOES: lets the app keep working (showing the last-loaded screen)
 * if a member opens it with no signal or a dead connection, and is one of
 * the standard things app-store reviewers check for on a "real" app.
 *
 * SAFETY DESIGN -- read before changing anything here:
 * A common, well-known bug with service workers is a member getting frozen
 * on an OLD version of the app forever, because the service worker keeps
 * serving old cached files instead of fetching the new ones after a
 * deploy. To avoid that, this file deliberately uses a "network-first"
 * strategy: it ALWAYS tries the real network first and only falls back to
 * the cache if the network request actually fails (offline, or the server
 * is unreachable). The cache is a safety net for outages, never the
 * primary source -- so a normal deploy with a live connection always shows
 * the newest version, same as if this file didn't exist at all.
 *
 * CACHE_VERSION below controls cleanup: bump it (v1 -> v2) any time you
 * want to force every old cached file to be thrown out on the next visit.
 * Not required for normal deploys (network-first already handles that) --
 * only useful if this file's own caching logic changes.
 */
const CACHE_VERSION = "hypergentiq-v1";

// Only cache real page/asset requests. API calls and third-party requests
// (Supabase, Anthropic, Stripe) are deliberately left completely alone --
// caching a login response, workout log write, or coach note would be a
// real bug (stale/wrong data shown as if it were current), not a feature.
function isCacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  // Take over immediately instead of waiting for every open tab to close --
  // members should get a fixed/updated app on their very next reload, not
  // get stuck waiting.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheable(request)) return; // let the browser handle it normally

  event.respondWith(
    (async () => {
      try {
        // Network first -- always prefer the real, current version.
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Network failed (offline / server unreachable) -- fall back to
        // whatever we last successfully cached for this exact request.
        const cached = await caches.match(request);
        if (cached) return cached;
        // Nothing cached for this either (e.g. very first visit while
        // offline) -- for a page navigation, fall back to the cached app
        // shell (index.html) so the member sees the app instead of the
        // browser's default "no internet" error page.
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
