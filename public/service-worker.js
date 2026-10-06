// App-shell cache so PesaTrack opens offline. Bump VERSION to force an update.
const VERSION = "pesatrack-v2";
const SHELL = [
    "/", "/index.html", "/auth.html", "/style.css", "/script.js",
    "/firestore.js", "/firebase-config.js", "/manifest.json",
    "/icons/icon-192.png", "/icons/icon-512.png"
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", e => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
    if (!sameOrigin && !firebaseSdk) return; // let Firestore/Auth API calls go straight through

    // Stale-while-revalidate: instant from cache, refreshed in the background.
    e.respondWith(
        caches.open(VERSION).then(async cache => {
            const cached = await cache.match(req);
            const network = fetch(req)
                .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
                .catch(() => cached);
            return cached || network;
        })
    );
});
