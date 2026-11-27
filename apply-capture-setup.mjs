// PesaTrack: automatic capture sets itself up in the app, and a checklist shows what's missing on a phone
// (SMS permission, sign-in, notifications, background running, last message). Run from the project root:
//   node apply-capture-setup.mjs   then  git add . ; git commit -m "Capture setup checklist" ; git push origin main ; firebase deploy --only hosting
let failed = 0;
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
if (!existsSync("public/inbox.js") || !existsSync(jv + "Sender.java")) { console.log("✗ run this from the project root (the folder containing public/ and android/)"); process.exit(1); }

// ---------- website ----------
patch("public/inbox.js", "capture-setup-v1", [
    ["    async function render() {",
`    // capture-setup-v1: what this phone still needs, from the app itself
    const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
    const optedOut = () => { try { return localStorage.getItem("pt_ac_off_" + uid) === "1"; } catch { return false; } };
    function statusHtml() {
        let st = null;
        try { st = JSON.parse(PesaTrackApp.status()); } catch {}
        if (!st || st.sms === undefined) return \`<p class="ingest-note"><strong>On.</strong> This phone sends each new M-Pesa message to PesaTrack by itself.</p>\`;   // older app without the checks
        const btn = (a, label) => \`<button type="button" class="secondary-button" data-ac="\${a}">\${label}</button>\`;
        const item = (ok, label, help, actions) => \`<li class="cap-item \${ok ? "ok" : "bad"}"><span class="cap-mark">\${ok ? "✓" : "!"}</span><div><strong>\${label}</strong>\${ok ? "" : \`<p>\${help}</p><div class="heading-actions">\${actions}</div>\`}</div></li>\`;
        const linked = !!(st.signedIn && st.configured), working = st.sms && linked;
        const last = st.lastSms ? \`Last M-Pesa message on this phone: \${ago(st.lastSms)}\${st.lastResult ? ", " + esc(st.lastResult) : ""}.\` : "No M-Pesa message has reached this phone yet.";
        return \`<p class="ingest-note"><strong>\${working ? "On." : "Not working yet."}</strong> \${working ? "New M-Pesa messages are added automatically." : "Fix the items marked ! below."}</p>
            <ul class="cap-list">
                \${item(st.sms, "Reading M-Pesa messages", "PesaTrack isn't allowed to read SMS yet. Tap Allow. If nothing happens, open app settings, tap the ⋮ menu and choose Allow restricted settings, then go to Permissions and allow SMS.", btn("sms", "Allow") + btn("appsettings", "Open app settings"))}
                \${item(linked, "Connected to your account", "This phone hasn't received your sign-in yet. Sign out and sign in again, then check here.", btn("refresh", "Check again"))}
                \${item(st.notify, "Notifications", "Allow notifications to see each transaction as it is captured.", btn("appsettings", "Open app settings"))}
                \${item(st.battery, "Runs in the background", "Some phones stop apps that aren't open. Allow PesaTrack to run in the background. On Tecno, Infinix, Xiaomi, Oppo and Samsung phones also switch on Autostart or lock the app in recent apps.", btn("battery", "Allow"))}
            </ul><p class="ingest-note">\${last}</p>\`;
    }

    async function render() {`],
    ["        const inApp = !!window.PesaTrackApp;\n",
`        if (!secret && window.PesaTrackApp && !optedOut()) {   // in the app, capture turns itself on: nothing to set up by hand
            try { const fresh = hex(24); await setDoc(settingsRef(), { secret: fresh, updatedAt: new Date().toISOString() }); secret = fresh; } catch (e) { console.warn("Auto-setup:", e); }
        }
        const inApp = !!window.PesaTrackApp;
`],
    ["            el.innerHTML = `${head}<p class=\"ingest-note\">A free automation app on your phone",
     "            el.innerHTML = inApp\n                ? `${head}<p class=\"ingest-note\"><strong>Off.</strong> Turn on to add transactions from your M-Pesa messages as they arrive.</p>\n                    <div class=\"heading-actions\"><button type=\"button\" class=\"primary-button\" data-ac=\"on\">Turn on</button></div>`\n                : `${head}<p class=\"ingest-note\">A free automation app on your phone"],
    ["                <p class=\"ingest-note\"><strong>On.</strong> This phone sends each new M-Pesa message to PesaTrack by itself. Nothing else to set up.</p>",
     "                ${statusHtml()}"],
    ["        const b = e.target.closest(\"[data-ac]\"); if (!b) return;\n        try {",
`        const b = e.target.closest("[data-ac]"); if (!b) return;
        const act = b.dataset.ac;
        if (act === "sms" || act === "appsettings" || act === "battery") {
            try { act === "sms" ? PesaTrackApp.requestSms() : act === "battery" ? PesaTrackApp.openBatterySettings() : PesaTrackApp.openAppSettings(); } catch {}
            return;
        }
        if (act === "refresh") { await render(); return; }
        try {`],
    ["                await setDoc(settingsRef(), { secret: hex(24), updatedAt: new Date().toISOString() });",
     "                try { localStorage.removeItem(\"pt_ac_off_\" + uid); } catch {}\n                await setDoc(settingsRef(), { secret: hex(24), updatedAt: new Date().toISOString() });"],
    ["                await deleteDoc(settingsRef());", "                await deleteDoc(settingsRef());\n                try { localStorage.setItem(\"pt_ac_off_\" + uid, \"1\"); } catch {}   // stays off until you turn it on"],
    ["    return {\n        onUser(user) {",
`    // the app tells the page when permissions change or you come back from phone settings
    const refresh = () => { if (uid && window.PesaTrackApp) render(); };
    window.addEventListener("pesatrack-status", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

    return {
        onUser(user) {`]
]);
patch("public/savings.css", "cap-item", [[/$/, "\n/* cap-item: automatic capture checklist (in the app) */\n.cap-list { list-style: none; margin: 12px 0 4px; padding: 0; }\n.cap-item { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }\n.cap-item:first-child { border-top: none; }\n.cap-item > div { min-width: 0; }\n.cap-item p { margin: 4px 0 8px; font-size: 13px; color: var(--muted); }\n.cap-mark { flex: none; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; background: var(--line); color: var(--text); }\n.cap-item.ok .cap-mark { background: var(--income, #2ea043); color: #fff; }\n.cap-item.bad .cap-mark { background: var(--expense, #e5484d); color: #fff; }\n"]]);
patch("public/service-worker.js", "/* capture-setup */", [[/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}"; /* capture-setup */`]]);

// ---------- Android app ----------
patch(jv + "Sender.java", "noteSms", [
    ["    // ---------- queue ----------",
`    // what the "Automatic M-Pesa capture" screen shows: when the last message arrived and what happened to it
    static void noteSms(Context c) { prefs(c).edit().putLong("last_sms", System.currentTimeMillis()).putString("last_result", "received").apply(); }
    static void note(Context c, String result) { prefs(c).edit().putString("last_result", result).apply(); }
    static long lastSms(Context c) { return prefs(c).getLong("last_sms", 0); }
    static String lastResult(Context c) { return prefs(c).getString("last_result", ""); }

    // ---------- queue ----------`],
    ["if (items.isEmpty() && transfers.isEmpty()) return true;", "if (items.isEmpty() && transfers.isEmpty()) { note(c, \"nothing to add from that message\"); return true; }"],
    ["            if (allDone) return true;", "            note(c, allDone ? \"saved to your account\" : \"waiting for internet\");\n            if (allDone) return true;"],
    ["        android.util.Log.i(\"PesaTrack\", \"inbox result=\" + code);",
     "        android.util.Log.i(\"PesaTrack\", \"inbox result=\" + code);\n        note(c, code == 200 ? \"sent to your inbox, it appears when you open the app\" : code == 400 ? \"couldn't be read\" : \"couldn't send, will retry\");"]
]);
patch(jv + "SmsReceiver.java", "noteSms", [
    ["        if (!ours) return;\n", "        if (!ours) return;\n        Sender.noteSms(context.getApplicationContext());\n"],
    ["                android.util.Log.i(\"PesaTrack\", \"configured=\" + Sender.configured(app));",
     "                android.util.Log.i(\"PesaTrack\", \"configured=\" + Sender.configured(app));\n                if (!Sender.configured(app)) Sender.note(app, \"capture isn't set up on this phone\");"]
]);
// repair: an earlier copy of this patch added a second onResume(), which stops the app from building
{
    const f = jv + "MainActivity.java";
    let text = readFileSync(f, "utf8"); const crlf = text.includes("\r\n"); if (crlf) text = text.replace(/\r\n/g, "\n");
    const dup = "    @Override protected void onResume() { super.onResume(); tellPage(); }   // back from phone settings: refresh the checklist\n\n";
    if (text.includes(dup)) {
        text = text.replace(dup, "");
        const old = "        new Thread(() -> Sender.flush(getApplicationContext())).start();   // send anything that was waiting for a connection\n    }";
        if (text.split(old).length === 2) text = text.replace(old, old.replace("\n    }", "\n        tellPage();   // back from phone settings: refresh the capture checklist\n    }"));
        writeFileSync(f, crlf ? text.replace(/\n/g, "\r\n") : text);
        console.log("✓ MainActivity.java: removed the duplicate onResume()");
    }
}
patch(jv + "MainActivity.java", "openSettingsScreen", [
    ["        @JavascriptInterface public void clearConfig() { if (trusted) Sender.clearConfig(getApplicationContext()); }",
`        @JavascriptInterface public void clearConfig() { if (trusted) Sender.clearConfig(getApplicationContext()); }
        @JavascriptInterface public String status() {   // what the "Automatic M-Pesa capture" checklist shows
            if (!trusted) return "{}";
            try {
                android.content.Context c = getApplicationContext();
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
                return new org.json.JSONObject()
                        .put("sms", checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED)
                        .put("notify", Build.VERSION.SDK_INT < 33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED)
                        .put("signedIn", Sender.signedIn(c)).put("configured", Sender.configured(c))
                        .put("battery", pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()))
                        .put("lastSms", Sender.lastSms(c)).put("lastResult", Sender.lastResult(c)).toString();
            } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void requestSms() {
            if (!trusted) return;
            runOnUiThread(() -> {
                java.util.ArrayList<String> need = new java.util.ArrayList<>();
                if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECEIVE_SMS);
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) need.add("android.permission.POST_NOTIFICATIONS");
                if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);
            });
        }
        @JavascriptInterface public void openAppSettings() { if (trusted) runOnUiThread(() -> openSettingsScreen(false)); }
        @JavascriptInterface public void openBatterySettings() { if (trusted) runOnUiThread(() -> openSettingsScreen(true)); }`],
    ["        new Thread(() -> Sender.flush(getApplicationContext())).start();   // send anything that was waiting for a connection\n    }",
     "        new Thread(() -> Sender.flush(getApplicationContext())).start();   // send anything that was waiting for a connection\n        tellPage();   // back from phone settings: refresh the capture checklist\n    }"],
    ["    // ---------- fingerprint / face unlock for the app lock ----------",
`    // ---------- capture checklist helpers ----------
    private void openSettingsScreen(boolean battery) {
        try {
            if (battery) {
                try { startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); return; }
                catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); return; }
            }
            startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {}
    }

    private void tellPage() { if (web != null) web.post(() -> web.evaluateJavascript("window.dispatchEvent(new Event('pesatrack-status'))", null)); }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) { super.onRequestPermissionsResult(req, perms, res); tellPage(); }

    // ---------- fingerprint / face unlock for the app lock ----------`]
]);
patch("android/app/src/main/AndroidManifest.xml", "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", [
    ['    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />', '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />']
]);
patch("android/app/build.gradle.kts", 'versionName = "0.13.0"', [
    [/versionCode = (\d+)/, (m, n) => `versionCode = ${+n + 1}`], [/versionName = "[\d.]+"/, 'versionName = "0.13.0"']
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: git add . ; git commit -m \"Capture setup checklist\" ; git push origin main ; firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
