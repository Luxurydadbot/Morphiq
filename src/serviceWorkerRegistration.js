// Registers public/service-worker.js so the app can keep working (last
// screen shown) if a member loses signal, and satisfies one of the
// standard "is this a real installable app" checks for app-store review.
//
// Only runs in production. Skipped entirely in local development so it
// never gets in the way while building/testing, and skipped if the
// browser doesn't support service workers at all (older browsers) --
// the app works completely normally either way, this is a bonus, not a
// requirement.
export function register() {
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => {
        // Never let a registration failure affect the app itself -- offline
        // support is a bonus, not a requirement to use Hypergentiq.
        console.warn("[Hypergentiq] Service worker registration failed:", err);
      });
  });
}
