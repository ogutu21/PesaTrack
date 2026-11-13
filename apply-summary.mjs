// PesaTrack app: monthly summary notification. Run from the project root (the folder containing android/):
//   node apply-summary.mjs     then  git add . ; git commit -m "App: monthly summary" ; git push origin main
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const jv = "android/app/src/main/java/app/pesatrack/";
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
if (!existsSync(jv + "Sender.java")) { console.log("✗ run this from the project root (the folder containing android/)"); process.exit(1); }
for (const f of ["SummaryMath.java", "SummaryJobService.java", "MonthSummary.java"]) { copyFileSync(join(here, "new", f), jv + f); console.log(`✓ ${f}: added`); }

patch(jv + "Notifier.java", "static void summary", [
    ["    private static void show(Context c, int id, String title, String text) {\n        try {",
`    private static void show(Context c, int id, String title, String text) {
        show(c, id, title, text, CHANNEL, "Captured M-Pesa transactions", "New M-Pesa activity");
    }

    // last month's totals
    static void summary(Context c, String title, String text) {
        show(c, ("summary" + title).hashCode(), title, text, "summary", "Monthly summary", "Your monthly summary is ready");
    }

    private static void show(Context c, int id, String title, String text, String channel, String channelName, String lockText) {
        try {`],
    ["nm.createNotificationChannel(new NotificationChannel(CHANNEL, \"Captured M-Pesa transactions\", NotificationManager.IMPORTANCE_DEFAULT));\n                b = new Notification.Builder(c, CHANNEL);",
     "nm.createNotificationChannel(new NotificationChannel(channel, channelName, NotificationManager.IMPORTANCE_DEFAULT));\n                b = new Notification.Builder(c, channel);"],
    ["Notification.Builder pub = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);",
     "Notification.Builder pub = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);"],
    ['.setContentText("New M-Pesa activity");', ".setContentText(lockText);"],
    [".setContentTitle(title).setContentText(text)\n", ".setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))\n"]
]);
patch(jv + "Sender.java", "queryMonth", [
    ["    // ---------- savings balances (M-Shwari, KCB M-PESA) ----------",
`    // ---------- monthly summary ----------
    static boolean signedIn(Context c) { return hasAuth(c); }

    // All of your transactions dated from \`start\` (inclusive) to \`end\` (exclusive), as Firestore's JSON answer; null when it couldn't be fetched.
    static String queryMonth(Context c, String start, String end) {
        SharedPreferences p = prefs(c);
        String project = PROJECT;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = token(c, attempt == 1);
            if (token == null) return null;
            try {
                String q = "{\\"structuredQuery\\":{\\"from\\":[{\\"collectionId\\":\\"transactions\\"}],\\"where\\":{\\"compositeFilter\\":{\\"op\\":\\"AND\\",\\"filters\\":["
                        + "{\\"fieldFilter\\":{\\"field\\":{\\"fieldPath\\":\\"date\\"},\\"op\\":\\"GREATER_THAN_OR_EQUAL\\",\\"value\\":{\\"stringValue\\":\\"" + start + "\\"}}},"
                        + "{\\"fieldFilter\\":{\\"field\\":{\\"fieldPath\\":\\"date\\"},\\"op\\":\\"LESS_THAN\\",\\"value\\":{\\"stringValue\\":\\"" + end + "\\"}}}]}},\\"limit\\":5000}}";
                URL url = new URL("https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/users/" + p.getString("uid", "") + ":runQuery");
                HttpURLConnection h = open(url, "application/json; charset=utf-8", project);
                h.setRequestProperty("Authorization", "Bearer " + token);
                try (OutputStream o = h.getOutputStream()) { o.write(q.getBytes(StandardCharsets.UTF_8)); }
                int code = h.getResponseCode();
                if (code == 401 && attempt == 0) { h.disconnect(); continue; }
                if (code != 200) { h.disconnect(); return null; }
                String body = read(h.getInputStream());
                h.disconnect();
                return body;
            } catch (Exception e) { return null; }
        }
        return null;
    }

    // ---------- savings balances (M-Shwari, KCB M-PESA) ----------`]
]);
patch("android/app/src/main/AndroidManifest.xml", "SummaryJobService", [
    ['        <service android:name=".RetryJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />',
     '        <service android:name=".RetryJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />\n        <service android:name=".SummaryJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />']
]);
patch(jv + "MainActivity.java", "SummaryJobService", [
    ["            if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);\n        }\n    }",
`            if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);
        }
        SummaryJobService.schedule(this);   // checks once a day whether last month's summary is due
        if (getIntent().getBooleanExtra("summary_test", false)) new Thread(() -> MonthSummary.run(getApplicationContext(), true)).start();   // for testing: adb ... --ez summary_test true
    }`]
]);
patch("android/app/build.gradle.kts", 'versionName = "0.11.0"', [
    [/versionCode = (\d+)/, (m, n) => `versionCode = ${+n + 1}`], [/versionName = "[\d.]+"/, 'versionName = "0.11.0"']
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: git add . ; git commit -m \"App: monthly summary\" ; git push origin main");
process.exit(failed ? 1 : 0);
