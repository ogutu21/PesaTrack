package app.pesatrack;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.Locale;

// "Added to PesaTrack" notification for each captured transaction.
final class Notifier {
    private static final String CHANNEL = "captured";
    private Notifier() {}

    static void savings(Context c, MpesaParser.Transfer t, boolean pending) {
        String name = t.account.equals("mshwari") ? "M-Shwari" : "KCB M-PESA";
        String moved = String.format(Locale.US, "Ksh %,.2f", t.amount) + (t.dir.equals("in") ? " saved" : " withdrawn");
        show(c, ("sv" + t.code).hashCode(), name + " balance updated", String.format(Locale.US, "Balance Ksh %,.2f · ", t.balance) + moved + (pending ? " · syncing when online" : ""));
    }

    static void captured(Context c, MpesaParser.Item it, boolean pending) {
        String amount = String.format(Locale.US, it.amount == Math.floor(it.amount) ? "%,.0f" : "%,.2f", it.amount);
        show(c, it.id.hashCode(), pending ? "Saved on your phone" : "Added to PesaTrack",
                it.description + " · Ksh " + amount + " · " + it.category + (pending ? " · syncing when online" : ""));
    }

    private static void show(Context c, int id, String title, String text) {
        show(c, id, title, text, CHANNEL, "Captured M-Pesa transactions", "New M-Pesa activity");
    }

    // last month's totals
    static void summary(Context c, String title, String text) {
        show(c, ("summary" + title).hashCode(), title, text, "summary", "Monthly summary", "Your monthly summary is ready");
    }

    private static void show(Context c, int id, String title, String text, String channel, String channelName, String lockText) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.w("PesaTrack", "notification skipped: permission not granted");
                return;
            }
            android.util.Log.i("PesaTrack", "showing notification: " + title);
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel(channel, channelName, NotificationManager.IMPORTANCE_DEFAULT));
                b = new Notification.Builder(c, channel);
            } else {
                b = new Notification.Builder(c);
            }
            PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder pub = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
            pub.setSmallIcon(R.drawable.ic_stat).setContentTitle("PesaTrack").setContentText(lockText);   // what shows on a locked screen
            b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
                    .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(pub.build())
                    .setContentIntent(open).setAutoCancel(true);
            nm.notify(id, b.build());
        } catch (Exception ignored) {}
    }
}
