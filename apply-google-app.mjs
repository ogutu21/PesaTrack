// Turns on Google sign-in inside the Android app. Run from the project root with your Web client ID:
//   node apply-google-app.mjs 227171165751-xxxxxxxx.apps.googleusercontent.com
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const id = process.argv[2];
if (!id || !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) {
    console.log("✗ Give your Web client ID, for example:\n    node apply-google-app.mjs 227171165751-xxxxxxxx.apps.googleusercontent.com"); process.exit(1);
}
const pub = join(process.argv[3] || ".", "public");
let failed = 0;
function edit(file, fn, okMsg) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    const out = fn(text);
    if (out === null) { console.log(`✗ ${file}: anchor not found, file left unchanged`); failed++; return; }
    if (out === text) { console.log(`• ${file}: already up to date`); return; }
    writeFileSync(path, crlf ? out.replace(/\n/g, "\r\n") : out);
    console.log(`✓ ${file}: ${okMsg}`);
}
edit("auth-app.js", t => /const WEB_CLIENT_ID = "[^"]*";/.test(t) ? t.replace(/const WEB_CLIENT_ID = "[^"]*";/, `const WEB_CLIENT_ID = "${id}";`) : null, "Web client ID set");
edit("auth.html", t => t.includes('<script type="module" src="/auth-app.js"></script>') ? t
    : t.includes('<script src="/auth-app.js"></script>') ? t.replace('<script src="/auth-app.js"></script>', '<script type="module" src="/auth-app.js"></script>') : null, "script tag updated");
edit("service-worker.js", t => /const VERSION = "pesatrack-v(\d+)";/.test(t) && !t.includes("/* google-app */") ? t.replace(/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}"; /* google-app */`) : t, "cache version bumped");
console.log(failed ? `\n${failed} problem(s).` : "\nDone. Next: firebase deploy --only hosting, then install the new app.");
process.exit(failed ? 1 : 0);
