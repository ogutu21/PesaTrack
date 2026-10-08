// Offline-capable app shell. Bump VERSION when you add files to SHELL.
const VERSION = "pesatrack-v13";
const SHELL = [
    "/", "/index.html", "/auth.html", "/style.css", "/script.js",
    "/firestore.js", "/firebase-config.js", "/mpesa.js", "/charts.js", "/features.js", "/categories.js", "/applock.js", "/currency.js", "/report.js", "/backup.js", "/household.js", "/recurrence.js", "/manifest.json",
    "/icons/icon-192.png", "/icons/icon-512.png"
];

self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(VERSION)
            .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
            .then(() => self.skipWaiting())
    );
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
    if (!sameOrigin && !firebaseSdk) return; // Firestore/Auth API calls go straight through

    if (sameOrigin) {
        // Network-first: new deploys show up immediately; cache is the offline fallback.
        e.respondWith(
            fetch(req)
                .then(res => {
                    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
                    return res;
                })
                .catch(() => caches.match(req).then(hit => hit || caches.match("/index.html")))
        );
    } else {
        // Versioned SDK files never change: cache-first.
        e.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then(res => {
                if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
                return res;
            }))
        );
    }
});
