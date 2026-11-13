package app.pesatrack;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

// In the first week of each month, shows a notification with last month's totals.
final class MonthSummary {
    private MonthSummary() {}

    private static double num(JSONObject fields, String name) {
        JSONObject v = fields.optJSONObject(name);
        if (v == null) return 0;
        if (v.has("doubleValue")) return v.optDouble("doubleValue", 0);
        try { return Double.parseDouble(v.optString("integerValue", "0")); } catch (Exception e) { return 0; }
    }

    private static String str(JSONObject fields, String name) {
        JSONObject v = fields.optJSONObject(name);
        return v == null ? "" : v.optString("stringValue", "");
    }

    /** true = finished (shown, not due, or nothing to show); false = couldn't reach the server, try again later. */
    static boolean run(Context c, boolean force) {
        if (!Sender.signedIn(c)) return true;
        SharedPreferences p = c.getSharedPreferences("pesatrack", Context.MODE_PRIVATE);
        Calendar now = Calendar.getInstance();
        Calendar prev = (Calendar) now.clone();
        prev.set(Calendar.DAY_OF_MONTH, 1);
        prev.add(Calendar.MONTH, -1);
        SimpleDateFormat ym = new SimpleDateFormat("yyyy-MM", Locale.US);
        String prevKey = ym.format(prev.getTime());
        if (!force) {
            if (prevKey.equals(p.getString("summary_month", ""))) return true;           // already shown
            if (now.get(Calendar.DAY_OF_MONTH) > 7) { p.edit().putString("summary_month", prevKey).apply(); return true; }   // too late to be useful
        }
        String body = Sender.queryMonth(c, prevKey + "-01", ym.format(now.getTime()) + "-01");
        android.util.Log.i("PesaTrack", "summary: " + prevKey + " query " + (body == null ? "failed" : "ok"));
        if (body == null) return false;
        SummaryMath m = new SummaryMath();
        try {
            JSONArray rows = new JSONArray(body);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject doc = rows.getJSONObject(i).optJSONObject("document");
                JSONObject f = doc == null ? null : doc.optJSONObject("fields");
                if (f != null) m.add(str(f, "type"), str(f, "category"), num(f, "amount"));
            }
        } catch (Exception e) { return true; }   // unreadable answer: skip this month rather than loop
        if (m.count > 0) Notifier.summary(c, new SimpleDateFormat("MMMM", Locale.US).format(prev.getTime()) + " summary", m.text());
        if (!force) p.edit().putString("summary_month", prevKey).apply();
        return true;
    }
}
