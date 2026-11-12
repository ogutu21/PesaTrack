// PesaTrack: automatic categories for repeat payees. Run from the project root (the folder containing public/):
//   node apply-payees.mjs
// Safe to re-run. Then: firebase deploy --only hosting, firebase deploy --only firestore:rules, and rebuild the Android app.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || ".";
let failed = 0;

function patch(file, marker, edits) {
    const path = join(root, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        const n = typeof find === "string" ? text.split(find).length - 1 : (text.match(new RegExp(find.source, find.flags.replace("g", "") + "g")) || []).length;
        if (n !== 1) { console.log(`✗ ${file}: ${n ? "anchor matches " + n + " places" : "anchor not found"}, file left unchanged:\n    ${String(find).slice(0, 100)}`); failed++; return; }
        text = typeof find === "string" ? text.replace(find, () => replace) : text.replace(find, replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}

for (const f of ["public/payee-core.js", "public/payees.js", "public/inbox.js", "public/inbox-core.js", "public/script.js"])
    if (!existsSync(join(root, f))) { console.log(`✗ ${f}: missing, unzip the package into the project root first`); failed++; }
if (failed) process.exit(1);

// ---------- Firestore rules: allow the payee memory document ----------
patch("firestore.rules", "payees-v1", [
    ["'secret', 'updatedAt'])", "'secret', 'map', 'updatedAt'])   // payees-v1"],
    ["          || (docId == 'currency'", "          || (docId == 'payees' && data.map is map && data.map.size() <= 200)\n          || (docId == 'currency'"]
]);

// ---------- website ----------
patch("public/inbox-core.js", "payee-memory-v1", [
    ['import { parseMpesa } from "./mpesa.js";',
     'import { parseMpesa } from "./mpesa.js";\nimport { payeeKey } from "./payee-core.js";   // payee-memory-v1\n\n// the category you chose last time for this person or till, if any\nconst learnedCategory = (it, learned) => { const k = payeeKey(it.description, it.type); return (k && learned[k]) || it.category; };'],
    ["    const out = { added: 0, duplicates: 0, unreadable: 0, failed: 0, transfers: 0 };",
     "    const out = { added: 0, duplicates: 0, unreadable: 0, failed: 0, transfers: 0 };\n    let learned = {};\n    try { if (deps.payees) learned = (await deps.payees()) || {}; } catch {}   // memory unavailable: use the built-in guesses"],
    ["category: it.category, date: it.date, createdAt: now });", "category: learnedCategory(it, learned), date: it.date, createdAt: now });"]
]);
patch("public/inbox.js", "payees:", [
    ['                remove: id => deleteDoc(doc(db, "users", uid, "inbox", id))',
     '                payees: async () => { const s = await getDoc(doc(db, "users", uid, "settings", "payees")); return s.exists() ? (s.data().map || {}) : {}; },\n                remove: id => deleteDoc(doc(db, "users", uid, "inbox", id))']
]);
patch("public/script.js", "initPayees", [
    ['import { initSavings } from "./savings.js";', 'import { initSavings } from "./savings.js";\nimport { initPayees } from "./payees.js";'],
    ["const savings = initSavings({ $, escapeHTML, formatCurrency });", "const savings = initSavings({ $, escapeHTML, formatCurrency });\nconst payees = initPayees();"],
    ["    savings.onUser(user);", "    savings.onUser(user);\n    payees.onUser(user);"],
    ["            transactions = list;\n            if (!monthDecided) {", "            transactions = list;\n            if (!workspace.id) payees.onTransactions(list);   // learn your categories (personal space only)\n            if (!monthDecided) {"]
]);

patch("public/service-worker.js", '"/payee-core.js"', [
    ['"/savings.js",', '"/savings.js", "/payees.js", "/payee-core.js",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);

// ---------- Android app ----------
const jv = "android/app/src/main/java/app/pesatrack/";
patch(jv + "MpesaParser.java", "payeeKey", [
    ["    static String guessCategory(String name, String type) {",
`    /** Same as payeeKey() in public/payee-core.js: "Paid to NAIVAS" -> "out naivas". "" when there is no named payee. */
    static String payeeKey(String description, String type) {
        Matcher m = Pattern.compile("^(sent to|paid to|received from)\\\\s+(.+)$", CI).matcher(description == null ? "" : description);
        if (!m.find()) return "";
        String name = m.group(2).toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
        if (name.length() > 40) name = name.substring(0, 40).trim();
        if (name.isEmpty()) return "";
        return ("income".equals(type) ? "in " : "out ") + name;
    }

    static String guessCategory(String name, String type) {`]
]);
patch(jv + "Sender.java", "payeeMap", [
    ["            for (MpesaParser.Item it : items) {\n                int code = create(c, it.id, txFields(it.id, it.description, it.amount, it.type, it.category, it.date));",
`            JSONObject learned = items.isEmpty() ? new JSONObject() : payeeMap(c);   // categories you chose before for the same payee
            for (MpesaParser.Item it : items) {
                String key = MpesaParser.payeeKey(it.description, it.type);
                if (!key.isEmpty() && learned.has(key)) it.category = learned.optString(key, it.category);
                int code = create(c, it.id, txFields(it.id, it.description, it.amount, it.type, it.category, it.date));`],
    ["    // ---------- savings balances (M-Shwari, KCB M-PESA) ----------",
`    // ---------- payee memory ----------
    // users/{uid}/settings/payees holds { map: { "out naivas": "Groceries", ... } }, kept up to date by the website.
    // Returns the latest copy, or the last one saved on the phone when offline.
    private static JSONObject payeeMap(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject cached = new JSONObject();
        try { cached = new JSONObject(p.getString("payees", "{}")); } catch (Exception ignored) {}
        String project = PROJECT;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = token(c, attempt == 1);
            if (token == null) return cached;
            try {
                HttpURLConnection g = (HttpURLConnection) new URL("https://firestore.googleapis.com/v1/projects/" + project
                        + "/databases/(default)/documents/users/" + p.getString("uid", "") + "/settings/payees").openConnection();
                g.setConnectTimeout(10000); g.setReadTimeout(10000);
                g.setRequestProperty("Authorization", "Bearer " + token);
                g.setRequestProperty("Referer", "https://" + project + ".web.app/");
                int gc = g.getResponseCode();
                if (gc == 401 && attempt == 0) { g.disconnect(); continue; }
                if (gc == 200) {
                    JSONObject fields = new JSONObject(read(g.getInputStream())).optJSONObject("fields");
                    g.disconnect();
                    JSONObject out = new JSONObject();
                    JSONObject m = fields == null ? null : fields.optJSONObject("map");
                    JSONObject mf = m == null || m.optJSONObject("mapValue") == null ? null : m.getJSONObject("mapValue").optJSONObject("fields");
                    if (mf != null) {
                        java.util.Iterator<String> keys = mf.keys();
                        while (keys.hasNext()) { String k = keys.next(); String v = mf.getJSONObject(k).optString("stringValue", ""); if (!v.isEmpty()) out.put(k, v); }
                    }
                    p.edit().putString("payees", out.toString()).apply();
                    return out;
                }
                g.disconnect();
                if (gc == 404) { p.edit().putString("payees", "{}").apply(); return new JSONObject(); }
                return cached;
            } catch (Exception e) { return cached; }
        }
        return cached;
    }

    // ---------- savings balances (M-Shwari, KCB M-PESA) ----------`]
]);
patch("android/app/build.gradle.kts", 'versionName = "0.10.0"', [
    ["versionCode = 12", "versionCode = 13"], ['versionName = "0.9.1"', 'versionName = "0.10.0"']
]);

console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: firebase deploy --only hosting, firebase deploy --only firestore:rules, then git push to rebuild the app.");
process.exit(failed ? 1 : 0);
