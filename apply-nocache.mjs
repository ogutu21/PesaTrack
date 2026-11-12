// Makes the app and website always check for the newest files (instead of reusing copies for up to an hour).
// Run from the project root:  node apply-nocache.mjs   then   firebase deploy --only hosting
import { readFileSync, writeFileSync, existsSync } from "node:fs";
let failed = 0;

// 1. firebase.json: Cache-Control: no-cache for scripts, styles, pages (the browser still reuses a file when it hasn't changed)
const fj = "firebase.json";
if (!existsSync(fj)) { console.log("✗ firebase.json: not found (run this from the project root)"); process.exit(1); }
let raw = readFileSync(fj, "utf8");
const crlf = raw.includes("\r\n");
const cfg = JSON.parse(raw.replace(/^﻿/, ""));
const headers = cfg.hosting && (Array.isArray(cfg.hosting) ? null : cfg.hosting.headers ||= []);
if (!headers) { console.log("✗ firebase.json: unexpected hosting layout, left unchanged"); failed++; }
else if (headers.some(h => h.source === "**/*.@(js|mjs|css|html|json)" && (h.headers || []).some(x => /cache-control/i.test(x.key)))) console.log("• firebase.json: already set");
else {
    headers.push({ source: "**/*.@(js|mjs|css|html|json)", headers: [{ key: "Cache-Control", value: "no-cache" }] });
    let out = JSON.stringify(cfg, null, 2) + "\n";
    writeFileSync(fj, crlf ? out.replace(/\n/g, "\r\n") : out);
    console.log("✓ firebase.json: scripts, styles and pages are now always rechecked");
}

// 2. service worker: new version, so phones drop their old saved copies
const sw = "public/service-worker.js";
if (!existsSync(sw)) { console.log("✗ service-worker.js: not found"); failed++; }
else {
    let t = readFileSync(sw, "utf8");
    const c = t.includes("\r\n"); if (c) t = t.replace(/\r\n/g, "\n");
    if (t.includes("/* nocache */")) console.log("• service-worker.js: already updated");
    else if (!/const VERSION = "pesatrack-v(\d+)";/.test(t)) { console.log("✗ service-worker.js: version line not found"); failed++; }
    else { t = t.replace(/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}"; /* nocache */`); writeFileSync(sw, c ? t.replace(/\n/g, "\r\n") : t); console.log("✓ service-worker.js: new cache version"); }
}
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
