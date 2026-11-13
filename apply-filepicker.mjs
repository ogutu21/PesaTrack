// PesaTrack app: lets the "Choose file" buttons work (import M-Pesa statement, restore backup). Run from the project root:
//   node apply-filepicker.mjs     then  git add . ; git commit ; git push origin main  (rebuilds the app)
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
patch("android/app/src/main/java/app/pesatrack/MainActivity.java", "onShowFileChooser", [
    ["    private volatile boolean trusted = false;",
     "    private android.webkit.ValueCallback<Uri[]> chooser;   // the file picker the page asked for\n    private volatile boolean trusted = false;"],
    ["        web.setWebViewClient(new WebViewClient() {",
`        web.setWebChromeClient(new android.webkit.WebChromeClient() {   // "Choose file" buttons (statement import, restore backup)
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (!trusted) { cb.onReceiveValue(null); return true; }
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = cb;
                try { startActivityForResult(p.createIntent(), 77); }
                catch (Exception e) { chooser = null; cb.onReceiveValue(null); }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {`],
    ["    private static boolean isOurs(Uri u) {",
`    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == 77) {
            if (chooser != null) chooser.onReceiveValue(android.webkit.WebChromeClient.FileChooserParams.parseResult(res, data));
            chooser = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    private static boolean isOurs(Uri u) {`]
]);
patch("android/app/build.gradle.kts", 'versionName = "0.10.1"', [[/versionCode = \d+/, "versionCode = 14"], [/versionName = "[\d.]+"/, 'versionName = "0.10.1"']]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: git add . ; git commit -m \"App: file picker\" ; git push origin main");
process.exit(failed ? 1 : 0);
