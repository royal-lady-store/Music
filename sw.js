// sw.js: caches the app shell (our files + Tailwind/fonts) so the app opens offline.
// Music/video and API calls are NOT handled here; saved tracks live in Cache Storage via app.js.
const SHELL = "omh-shell-v1";
const FILES = ["./", "index.html", "js/app.js", "js/providers.js", "js/config.js", "manifest.json", "icon-192.png", "icon-512.png"];
const STATIC_HOSTS = ["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e =>
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));

self.addEventListener("activate", e =>
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("omh-shell") && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

// Network first (so updates arrive), fall back to the cached copy when offline.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || (u.origin !== location.origin && !STATIC_HOSTS.includes(u.host))) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request)));
});
