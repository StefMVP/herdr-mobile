// App shell: cached for instant launch, refreshed in the background.
// API, terminal sockets and report files always go to the network.
const VERSION = "__VERSION__";
const SHELL = __SHELL__;
const CACHE = `shell-${VERSION}`;
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/") || url.pathname.startsWith("/f/")) return;
  const isPage = e.request.mode === "navigate";
  const key = isPage ? "/" : e.request;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(e.request).then((r) => { if (r.ok && !isPage) c.put(e.request, r.clone()); return r; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
