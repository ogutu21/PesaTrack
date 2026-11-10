// Makes fingerprint unlock work inside the Android app. Run from the project root:  node apply-biometric.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const pub = join(process.argv[2] || ".", "public");
let failed = 0;
function patch(file, marker, edits) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!text.includes(find)) { console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${find.slice(0, 90)}`); failed++; return; }
        text = text.replace(find, () => replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}
patch("applock.js", "nativePrompt", [
    ["async function biometricAvailable() {\n",
`// Inside the Android app the phone's own fingerprint prompt is used (web fingerprint is not available in an app window).
const nativeBio = () => !!(window.PesaTrackApp && typeof window.PesaTrackApp.biometricAvailable === "function");
function nativePrompt() {
    return new Promise(resolve => {
        const id = "b" + Math.random().toString(36).slice(2, 12);
        (window.__pesaBio ||= {})[id] = resolve;
        try { window.PesaTrackApp.authenticate(id); } catch { delete window.__pesaBio[id]; resolve(false); }
    });
}

async function biometricAvailable() {
    if (nativeBio()) { try { return !!window.PesaTrackApp.biometricAvailable(); } catch { return false; } }
`],
    ['            await navigator.credentials.get({ publicKey: { challenge: rand(32), userVerification: "required", timeout: 60000,',
     '            if (nativeBio()) { if (!(await nativePrompt())) throw new Error("not recognised"); }\n            else await navigator.credentials.get({ publicKey: { challenge: rand(32), userVerification: "required", timeout: 60000,'],
    ["            const cred = await navigator.credentials.create({ publicKey: {",
     "            const cred = nativeBio() ? null : await navigator.credentials.create({ publicKey: {"],
    ["            cfg.credId = toB64(cred.rawId); saveCfg(uid, cfg);",
     '            if (nativeBio()) { if (!(await nativePrompt())) throw new Error("cancelled"); cfg.credId = "app"; }\n            else cfg.credId = toB64(cred.rawId);\n            saveCfg(uid, cfg);']
]);
console.log(failed ? `\n${failed} problem(s), nothing half-applied.` : "\nDone. Next: firebase deploy --only hosting, then build the new app.");
process.exit(failed ? 1 : 0);
