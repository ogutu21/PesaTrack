// PesaTrack: "update available" notice in the app + a download page for friends. Run from the project root:
//   node apply-update-notice.mjs   then  git add . ; git commit -m "Update notice" ; git push origin main ; firebase deploy --only hosting
// After the new app build: put the APK in Google Drive and run  node release-app.mjs "<Drive link>"  (see the notes in that file).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
let failed = 0;
function patch(file, marker, edits) {
    if (!existsSync(file)) { console.log(`✗ ${file}: not found (run from the project root)`); failed++; return; }
    let text = readFileSync(file, "utf8"); const crlf = text.includes("\r\n"); if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        const n = typeof find === "string" ? text.split(find).length - 1 : (text.match(new RegExp(find.source, "g")) || []).length;
        if (n !== 1) { console.log(`✗ ${file}: ${n ? "anchor matches " + n + " places" : "anchor not found"}, left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return; }
        text = typeof find === "string" ? text.replace(find, () => replace) : text.replace(find, replace);
    }
    writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text); console.log(`✓ ${file}: patched`);
}
const jv = "android/app/src/main/java/app/pesatrack/";
if (!existsSync("public/app-update.js") || !existsSync("release-app.mjs")) { console.log("✗ unzip the package into the project root first (app-update.js or release-app.mjs is missing)"); process.exit(1); }
if (!existsSync("public/script.js") || !existsSync(jv + "MainActivity.java")) { console.log("✗ run this from the project root (the folder containing public/ and android/)"); process.exit(1); }

patch("public/script.js", "app-update.js", [
    ['import { initPayees } from "./payees.js";', 'import { initPayees } from "./payees.js";\nimport "./app-update.js";   // tells the Android app when a newer version exists']
]);
patch("public/savings.css", "update-bar", [[/$/, `
/* update-bar: "update available" notice in the Android app */
.update-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 0 0 18px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--primary); border-radius: 14px; }
.update-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 16rem; }
.update-text small { font-size: 13px; color: var(--muted); }
.update-text .update-hint { margin-top: 4px; color: var(--text); }
.update-actions { display: flex; gap: 8px; }
`]]);
patch("public/service-worker.js", '"/app-update.js"', [
    ['"/savings.js", "/payees.js",', '"/savings.js", "/app-update.js", "/payees.js",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);
patch(jv + "MainActivity.java", "openUrl", [
    ["        @JavascriptInterface public void clearConfig() { if (trusted) Sender.clearConfig(getApplicationContext()); }",
`        @JavascriptInterface public void clearConfig() { if (trusted) Sender.clearConfig(getApplicationContext()); }
        @JavascriptInterface public int versionCode() {   // lets the website tell whether a newer app exists
            if (!trusted) return 0;
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return (int) (Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            } catch (Exception e) { return 0; }
        }
        @JavascriptInterface public void openUrl(String url) {   // opens the app download in the browser; only Google Drive and our own site
            if (!trusted || url == null || url.length() > 300) return;
            final Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.ROOT);
            if (!"https".equals(u.getScheme()) || !(host.equals("drive.google.com") || host.equals("drive.usercontent.google.com") || host.equals("docs.google.com") || host.equals("pesatrack-92632.web.app"))) return;
            runOnUiThread(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {} });
        }`]
]);
patch("android/app/build.gradle.kts", 'versionName = "0.14.0"', [
    [/versionCode = (\d+)/, (m, n) => `versionCode = ${+n + 1}`], [/versionName = "[\d.]+"/, 'versionName = "0.14.0"']
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: git add . ; git commit -m \"Update notice\" ; git push origin main ; firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
