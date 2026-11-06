// PesaTrack security hardening. Run from the project root (the folder containing public/):
//   node apply-security.mjs              adds everything; the CSP starts in report-only mode (cannot break the app)
//   node apply-security.mjs --enforce    switches the CSP to enforcing, once the browser console is clean
// Safe to re-run (also re-run it after editing an inline <script> in index.html or auth.html: it refreshes the CSP hashes).
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || ".";
const pub = join(root, "public");
const enforceFlag = process.argv.includes("--enforce");
let failed = 0;

// ---------- small helper: patch one file, CRLF-safe, all-or-nothing ----------
function patch(file, marker, edits, base = pub) {
    const path = join(base, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) {
            console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 100)}`); failed++; return;
        }
        text = typeof find === "string" ? text.split(find).join(replace) : text.replace(find, replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}

// ---------- 1. data-injection fixes ----------
patch("categories.js", "EMOJI_CHOICES.includes(c.icon)", [
    ['custom = (Array.isArray(list) ? list : []).filter(c => c && c.name && (c.type === "expense" || c.type === "income"));',
     `// Custom categories sync from the database (and from other household members), so never trust them as HTML:
    // the icon must be one of the offered emoji and the name is length-limited.
    custom = (Array.isArray(list) ? list : [])
        .filter(c => c && c.name && (c.type === "expense" || c.type === "income"))
        .map(c => ({ ...c, name: String(c.name).slice(0, 40), icon: EMOJI_CHOICES.includes(c.icon) ? c.icon : "💰" }));`]
]);

patch("script.js", "wipeLocalCache", [
    ['value="${budgets[c] || ""}"', 'value="${Number(budgets[c]) || ""}"'],
    [/normalizeTags(\s*\n\s*\}\s*from "\.\/firestore\.js")/, "normalizeTags, wipeLocalCache, flushPending$1"],
    [/await signOut\(auth\);(\s*)window\.location\.href = "auth\.html";/,
     // finish queued writes, then clear the offline copy of your data (so the next person on this device can't read it),
     // and only then sign out: signing out triggers the redirect to the login page, which would cut the wipe short
     'await flushPending();$1await wipeLocalCache();$1await signOut(auth);$1window.location.href = "auth.html";']
]);

patch("firestore.js", "wipeLocalCache", [
    [/\bwriteBatch(\s*\n\s*\}\s*from "https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js")/, "writeBatch, terminate, clearIndexedDbPersistence, waitForPendingWrites$1"],
    [/\n*$/, `

// ---------- logout hygiene ----------
// Give queued offline writes a few seconds to reach the server before we sign out.
export async function flushPending(ms = 4000) {
    try { await Promise.race([waitForPendingWrites(db), new Promise(r => setTimeout(r, ms))]); } catch { /* offline: carry on */ }
}
// Remove the offline copy of the data (IndexedDB) so it isn't left behind on a shared phone or computer.
export async function wipeLocalCache() {
    try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { console.warn("Could not clear the local cache:", e); }
}
`]
]);

patch("statement-pdf.js", "isEvalSupported", [
    ["const lib = await load();", 'const lib = await load();\n    if (file.size > 40 * 1024 * 1024) throw new Error("File too large to be a statement");'],
    ["lib.getDocument({ data: data.slice(), password })", "lib.getDocument({ data: data.slice(), password, isEvalSupported: false })"],
    ["const pages = [];", 'if (doc.numPages > 600) throw new Error("Too many pages for a statement");\n    const pages = [];']
]);

patch("service-worker.js", '"/__/"', [
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${Number(n) + 1}";`],
    [/(if \(!sameOrigin && !firebaseSdk\) return;[^\n]*)/, '$1\n    if (url.pathname.startsWith("/__/")) return;      // Firebase sign-in handler: never cache'] 
]);

patch("auth.html", "at least 8 characters", [
    [/(busy\s*=\s*true;\s*)(if\s*\(signupMode\)\s*\{)/,
     `$1if (signupMode && password.length < 8) {
                showError("Use at least 8 characters for your password.");   // at least 8 characters
                busy = false; submitButton.disabled = false; return;
            }

            $2`]
]);

// ---------- 2. Firestore rules ----------
{
    const target = join(root, "firestore.rules"), source = join(root, "security", "firestore.rules");
    if (!existsSync(source)) { console.log("✗ security/firestore.rules missing: unzip the package into the project root first"); failed++; }
    else if (existsSync(target) && readFileSync(target, "utf8").includes("security-hardening-v1")) console.log("• firestore.rules: already hardened, skipped");
    else {
        if (existsSync(target)) copyFileSync(target, join(root, "firestore.rules.before-security"));
        copyFileSync(source, target);
        console.log("✓ firestore.rules: replaced (old copy saved as firestore.rules.before-security). Deploy with: firebase deploy --only firestore:rules");
    }
}

// ---------- 3. hosting headers + CSP (inline scripts are allowed by hash, not by 'unsafe-inline') ----------
function inlineScriptHashes(file) {
    const p = join(pub, file);
    if (!existsSync(p)) return [];
    const html = readFileSync(p, "utf8").replace(/\r\n/g, "\n");   // browsers normalise CRLF before hashing
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(m => m[1]).filter(s => s.trim())
        .map(s => `'sha256-${createHash("sha256").update(s).digest("base64")}'`);
}
{
    const path = join(root, "firebase.json");
    if (!existsSync(path)) { console.log("✗ firebase.json not found"); failed++; }
    else {
        const cfg = JSON.parse(readFileSync(path, "utf8"));
        cfg.hosting ||= {};
        const headers = (cfg.hosting.headers ||= []);
        const old = headers.find(h => h.source === "**" && h.headers.some(x => /^Content-Security-Policy/.test(x.key)));
        const wasEnforcing = !!(old && old.headers.some(x => x.key === "Content-Security-Policy"));
        const enforce = enforceFlag || wasEnforcing;
        const hashes = [...new Set([...inlineScriptHashes("index.html"), ...inlineScriptHashes("auth.html")])];
        const csp = [
            "default-src 'self'",
            `script-src 'self' https://www.gstatic.com https://apis.google.com 'wasm-unsafe-eval' ${hashes.join(" ")}`.trim(),
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://*.googleusercontent.com",
            "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com",
            "frame-src https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://apis.google.com",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
        ].join("; ");
        const entry = {
            source: "**",
            headers: [
                { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()" }
            ]
        };
        const i = headers.indexOf(old);
        if (i >= 0) headers[i] = entry; else headers.push(entry);
        writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
        console.log(`✓ firebase.json: security headers set, CSP is ${enforce ? "ENFORCING" : "in report-only mode"} (${hashes.length} inline-script hashes)`);
    }
}

console.log(failed ? `\n${failed} problem(s). Nothing was broken: fix and run again.` : "\nDone. See SECURITY.md for the deploy steps and the checks to do in the Firebase console.");
process.exit(failed ? 1 : 0);
