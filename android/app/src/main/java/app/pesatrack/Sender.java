package app.pesatrack;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

// Sends M-Pesa SMS text to the user's private PesaTrack inbox (the same one MacroDroid would use).
// Messages that can't be sent (no signal) wait in a small queue and go out next time.
final class Sender {
    private static final String PREFS = "pesatrack";
    private static final int MAX_QUEUE = 50;
    private Sender() {}

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void saveConfig(Context c, String uid, String apiKey, String secret, String project) {
        prefs(c).edit().putString("uid", uid).putString("key", apiKey).putString("secret", secret).putString("project", project).apply();
    }

    static void clearConfig(Context c) { prefs(c).edit().remove("uid").remove("key").remove("secret").remove("project").remove("queue").apply(); }

    static boolean configured(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("uid", null) != null && p.getString("secret", null) != null;
    }

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

    static synchronized void flush(Context c) {
        if (!configured(c)) return;
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                String text = q.getString(i);
                int code = post(c, text);
                if (code != 200 && code != 400) keep.put(text);   // keep for later on network errors or refusals; drop only success or a malformed message
            }
            prefs(c).edit().putString("queue", keep.toString()).apply();
        } catch (Exception ignored) {}
    }

    // returns the HTTP status, or -1 when there is no connection
    private static int post(Context c, String text) {
        SharedPreferences p = prefs(c);
        try {
            String project = p.getString("project", "pesatrack-92632");
            String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/users/"
                    + p.getString("uid", "") + "/inbox?key=" + URLEncoder.encode(p.getString("key", ""), "UTF-8");
            JSONObject fields = new JSONObject()
                    .put("text", new JSONObject().put("stringValue", text))
                    .put("secret", new JSONObject().put("stringValue", p.getString("secret", "")));
            byte[] body = new JSONObject().put("fields", fields).toString().getBytes(StandardCharsets.UTF_8);
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setRequestMethod("POST");
            h.setConnectTimeout(15000);
            h.setReadTimeout(15000);
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            h.setRequestProperty("Referer", "https://" + project + ".web.app/");   // needed if the API key is restricted by website
            try (OutputStream o = h.getOutputStream()) { o.write(body); }
            int code = h.getResponseCode();
            h.disconnect();
            return code;
        } catch (Exception e) {
            return -1;
        }
    }
}
