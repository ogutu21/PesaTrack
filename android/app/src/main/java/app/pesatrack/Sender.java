package app.pesatrack;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

// Handles M-Pesa SMS. When PesaTrack has handed this app your sign-in, each message is read here and saved straight to
// your transactions (no need to open the app). Otherwise it goes to the private inbox, as before.
// Messages that can't be handled yet (no signal) wait in a small queue and are retried.
final class Sender {
    private static final String PREFS = "pesatrack";
    private static final int MAX_QUEUE = 50;
    private static final String PROJECT = "pesatrack-92632";   // fixed: a web page can never point this app at another project
    private Sender() {}

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ---------- settings handed over by the PesaTrack page ----------
    // Values come from the web page, so they are checked before they are kept.
    static void saveConfig(Context c, String uid, String apiKey, String secret, String project) {
        if (uid == null || !uid.matches("[A-Za-z0-9]{10,64}")) return;
        if (apiKey == null || !apiKey.matches("AIza[0-9A-Za-z_-]{30,50}")) return;
        if (secret == null || !secret.matches("[0-9a-f]{32,64}")) return;
        prefs(c).edit().putString("uid", uid).putString("key", apiKey).putString("secret", secret).apply();
    }

    static void saveAuth(Context c, String refreshToken) {
        if (refreshToken == null || refreshToken.length() > 4096 || !refreshToken.matches("[A-Za-z0-9._~+/=-]{20,}")) return;
        String old = prefs(c).getString("refresh", null);
        if (refreshToken.equals(old)) return;
        prefs(c).edit().putString("refresh", refreshToken).remove("idtoken").remove("idexp").apply();
    }

    static void clearConfig(Context c) {
        prefs(c).edit().remove("uid").remove("key").remove("secret").remove("refresh").remove("idtoken").remove("idexp").remove("queue").apply();
    }

    static boolean configured(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("uid", null) != null && p.getString("secret", null) != null;
    }

    private static boolean hasAuth(Context c) { return prefs(c).getString("refresh", null) != null; }

    // ---------- queue ----------
    static synchronized void enqueue(Context c, String text) {
        if (!configured(c)) return;   // automatic capture is off: drop it, nothing is stored
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            q.put(text);
            JSONArray trimmed = new JSONArray();
            for (int i = Math.max(0, q.length() - MAX_QUEUE); i < q.length(); i++) trimmed.put(q.get(i));
            prefs(c).edit().putString("queue", trimmed.toString()).apply();
        } catch (Exception ignored) {}
    }

    static boolean hasQueue(Context c) {
        try { return new JSONArray(prefs(c).getString("queue", "[]")).length() > 0; } catch (Exception e) { return false; }
    }

    // true the first time it is called for this key: stops a second notification when a waiting message is finally sent
    private static boolean firstTime(Context c, String key) {
        SharedPreferences p = prefs(c);
        java.util.Set<String> seen = new java.util.HashSet<>(p.getStringSet("notified", new java.util.HashSet<String>()));
        if (seen.contains(key)) return false;
        if (seen.size() > 300) seen.clear();
        seen.add(key);
        p.edit().putStringSet("notified", seen).apply();
        return true;
    }

    static synchronized void flush(Context c) {
        if (!configured(c)) return;
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                String text = q.getString(i);
                if (!handle(c, text)) keep.put(text);
            }
            prefs(c).edit().putString("queue", keep.toString()).apply();
            if (keep.length() > 0) RetryJobService.schedule(c);   // wake up when the internet is back
        } catch (Exception ignored) {}
    }

    // true = finished with this message, false = try again later
    private static boolean handle(Context c, String text) {
        android.util.Log.i("PesaTrack", "handle: signedInForDirectSave=" + hasAuth(c) + ", items=" + MpesaParser.parse(text).size() + ", transfers=" + MpesaParser.parseTransfers(text).size());
        if (hasAuth(c)) {
            List<MpesaParser.Item> items = MpesaParser.parse(text);
            List<MpesaParser.Transfer> transfers = MpesaParser.parseTransfers(text);
            if (items.isEmpty() && transfers.isEmpty()) return true;   // not a message we understand (Fuliza notice, reversal, other text)
            boolean allDone = true;
            for (MpesaParser.Transfer tr : transfers) {
                int sc = saveSavings(c, tr);
                if ((sc == 200 && lastSavingsChanged || sc == -1) && firstTime(c, "sv" + tr.code)) Notifier.savings(c, tr, sc == -1);
                if (sc != 200 && sc != 400) allDone = false;
            }
            JSONObject learned = items.isEmpty() ? new JSONObject() : payeeMap(c);   // categories you chose before for the same payee
            for (MpesaParser.Item it : items) {
                String key = MpesaParser.payeeKey(it.description, it.type);
                if (!key.isEmpty() && learned.has(key)) it.category = learned.optString(key, it.category);
                int code = create(c, it.id, txFields(it.id, it.description, it.amount, it.type, it.category, it.date));
                android.util.Log.i("PesaTrack", "save result=" + code + " (-1 means no connection)");
                if ((code == 200 || code == -1) && firstTime(c, it.id)) Notifier.captured(c, it, code == -1);   // offline: told right away, saved when the internet is back
                if (code != 200 && code != 409 && code != 400) { allDone = false; continue; }   // 409 = already added, 400 = can't be saved; both are finished
                if (it.fee > 0 && (code == 200 || code == 409)) {
                    int fc = create(c, it.id + "-fee", txFields(it.id + "-fee", "M-Pesa fee (" + (it.code == null ? "SMS" : it.code) + ")", it.fee, "expense", "Fees & Charges", it.date));
                    if (fc != 200 && fc != 409 && fc != 400) allDone = false;
                }
            }
            if (allDone) return true;
            if (hasAuth(c)) return false;       // network or temporary problem: retry later
            // the saved sign-in stopped working: fall through to the inbox
        }
        int code = postInbox(c, text);
        android.util.Log.i("PesaTrack", "inbox result=" + code);
        return code == 200 || code == 400;
    }

    // ---------- payee memory ----------
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

    // ---------- monthly summary ----------
    static boolean signedIn(Context c) { return hasAuth(c); }

    // All of your transactions dated from `start` (inclusive) to `end` (exclusive), as Firestore's JSON answer; null when it couldn't be fetched.
    static String queryMonth(Context c, String start, String end) {
        SharedPreferences p = prefs(c);
        String project = PROJECT;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = token(c, attempt == 1);
            if (token == null) return null;
            try {
                String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"transactions\"}],\"where\":{\"compositeFilter\":{\"op\":\"AND\",\"filters\":["
                        + "{\"fieldFilter\":{\"field\":{\"fieldPath\":\"date\"},\"op\":\"GREATER_THAN_OR_EQUAL\",\"value\":{\"stringValue\":\"" + start + "\"}}},"
                        + "{\"fieldFilter\":{\"field\":{\"fieldPath\":\"date\"},\"op\":\"LESS_THAN\",\"value\":{\"stringValue\":\"" + end + "\"}}}]}},\"limit\":5000}}";
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

    // ---------- savings balances (M-Shwari, KCB M-PESA) ----------
    private static boolean lastSavingsChanged;

    // Saves users/{uid}/savings/{account} unless a newer message already set it. Returns 200 when finished, else a failure code (-1 = offline).
    private static int saveSavings(Context c, MpesaParser.Transfer t) {
        lastSavingsChanged = false;
        SharedPreferences p = prefs(c);
        String project = PROJECT;
        String docPath = "projects/" + project + "/databases/(default)/documents/users/" + p.getString("uid", "") + "/savings/" + t.account;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = token(c, attempt == 1);
            if (token == null) return -1;
            try {
                // is there already a newer balance?
                HttpURLConnection g = (HttpURLConnection) new URL("https://firestore.googleapis.com/v1/" + docPath).openConnection();
                g.setConnectTimeout(15000); g.setReadTimeout(15000);
                g.setRequestProperty("Authorization", "Bearer " + token);
                g.setRequestProperty("Referer", "https://" + project + ".web.app/");
                int gc = g.getResponseCode();
                if (gc == 401 && attempt == 0) { g.disconnect(); continue; }
                if (gc == 200) {
                    String existing = new JSONObject(read(g.getInputStream())).getJSONObject("fields").getJSONObject("asOf").getString("stringValue");
                    g.disconnect();
                    if (existing.compareTo(t.asOf) > 0) return 200;   // a later message already updated it
                } else {
                    g.disconnect();
                    if (gc != 404) return gc;
                }
                SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                f.setTimeZone(TimeZone.getTimeZone("UTC"));
                JSONObject fields = new JSONObject()
                        .put("balance", new JSONObject().put("doubleValue", t.balance))
                        .put("asOf", sv(t.asOf))
                        .put("lastAmount", new JSONObject().put("doubleValue", t.amount))
                        .put("lastDir", sv(t.dir)).put("lastDate", sv(t.date))
                        .put("updatedAt", sv(f.format(new Date())));
                JSONObject write = new JSONObject().put("update", new JSONObject().put("name", docPath).put("fields", fields));
                String body = new JSONObject().put("writes", new JSONArray().put(write)).toString();
                int code = send("https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents:commit", body, "Bearer " + token, project);
                if (code == 401 && attempt == 0) continue;
                if (code == 200) lastSavingsChanged = true;
                return code;
            } catch (Exception e) { return -1; }
        }
        return -1;
    }

    // ---------- direct write to the user's transactions ----------
    private static JSONObject txFields(String id, String description, double amount, String type, String category, String date) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject fields = new JSONObject()
                    .put("id", sv(id)).put("description", sv(description))
                    .put("amount", new JSONObject().put("doubleValue", amount))
                    .put("type", sv(type)).put("category", sv(category)).put("date", sv(date))
                    .put("createdAt", sv(f.format(new Date())));
            return new JSONObject().put("fields", fields);
        } catch (Exception e) { return null; }
    }

    private static JSONObject sv(String s) throws Exception { return new JSONObject().put("stringValue", s); }

    // creates users/{uid}/transactions/{docId}; never overwrites. Returns the HTTP status, or -1 when it could not be sent.
    private static int create(Context c, String docId, JSONObject body) {
        if (body == null) return 400;
        SharedPreferences p = prefs(c);
        String project = PROJECT;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = token(c, attempt == 1);
            if (token == null) return -1;
            try {
                String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/users/"
                        + p.getString("uid", "") + "/transactions?documentId=" + URLEncoder.encode(docId, "UTF-8");
                int code = send(url, body.toString(), "Bearer " + token, project);
                if (code == 401 && attempt == 0) continue;   // token went stale, get a new one and retry once
                return code;
            } catch (Exception e) { return -1; }
        }
        return -1;
    }

    // a current sign-in token, or null (offline, or the saved sign-in no longer works and was dropped)
    private static String token(Context c, boolean force) {
        SharedPreferences p = prefs(c);
        String cached = p.getString("idtoken", null);
        if (!force && cached != null && System.currentTimeMillis() < p.getLong("idexp", 0) - 60000) return cached;
        String refresh = p.getString("refresh", null);
        if (refresh == null) return null;
        try {
            String project = PROJECT;
            URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(p.getString("key", ""), "UTF-8"));
            byte[] form = ("grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8")).getBytes(StandardCharsets.UTF_8);
            HttpURLConnection h = open(url, "application/x-www-form-urlencoded", project);
            try (OutputStream o = h.getOutputStream()) { o.write(form); }
            int code = h.getResponseCode();
            if (code == 200) {
                JSONObject j = new JSONObject(read(h.getInputStream()));
                h.disconnect();
                String id = j.getString("id_token");
                long ttl = Long.parseLong(j.optString("expires_in", "3600"));
                p.edit().putString("idtoken", id).putLong("idexp", System.currentTimeMillis() + ttl * 1000)
                        .putString("refresh", j.optString("refresh_token", refresh)).apply();
                return id;
            }
            h.disconnect();
            if (code == 400 || code == 401) p.edit().remove("refresh").remove("idtoken").remove("idexp").apply();   // revoked or invalid
        } catch (Exception ignored) {}
        return null;
    }

    // ---------- fallback: the private inbox (needs no sign-in) ----------
    private static int postInbox(Context c, String text) {
        SharedPreferences p = prefs(c);
        try {
            String project = PROJECT;
            String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/users/"
                    + p.getString("uid", "") + "/inbox?key=" + URLEncoder.encode(p.getString("key", ""), "UTF-8");
            JSONObject fields = new JSONObject().put("text", sv(text)).put("secret", sv(p.getString("secret", "")));
            return send(url, new JSONObject().put("fields", fields).toString(), null, project);
        } catch (Exception e) { return -1; }
    }

    // ---------- http ----------
    private static HttpURLConnection open(URL url, String contentType, String project) throws Exception {
        HttpURLConnection h = (HttpURLConnection) url.openConnection();
        h.setRequestMethod("POST");
        h.setConnectTimeout(15000);
        h.setReadTimeout(15000);
        h.setDoOutput(true);
        h.setRequestProperty("Content-Type", contentType);
        h.setRequestProperty("Referer", "https://" + project + ".web.app/");   // needed if the API key is restricted by website
        return h;
    }

    private static int send(String url, String json, String authorization, String project) throws Exception {
        HttpURLConnection h = open(new URL(url), "application/json; charset=utf-8", project);
        if (authorization != null) h.setRequestProperty("Authorization", authorization);
        try (OutputStream o = h.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
        int code = h.getResponseCode();
        h.disconnect();
        return code;
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }
}
