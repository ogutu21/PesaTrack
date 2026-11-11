// Switches the GitHub build to a release (non-debuggable) app. Run from the project root: node apply-security2.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const f = ".github/workflows/android.yml";
if (!existsSync(f)) { console.log(`✗ ${f}: not found (run this from the project root)`); process.exit(1); }
let t = readFileSync(f, "utf8");
const crlf = t.includes("\r\n"); if (crlf) t = t.replace(/\r\n/g, "\n");
const before = t;
t = t.replace(/assembleDebug/g, "assembleRelease").replace(/apk\/debug\/app-debug\.apk/g, "apk/release/app-release.apk");
if (t === before) console.log("• android.yml: already building the release app, nothing to change");
else { writeFileSync(f, crlf ? t.replace(/\n/g, "\r\n") : t); console.log("✓ android.yml: now builds the release app"); }
console.log("Next: git add . ; git commit ; git push. The new file to install is app-release.apk (from the PesaTrack-apk download).");
