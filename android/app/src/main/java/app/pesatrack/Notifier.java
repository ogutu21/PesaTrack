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

    static void captured(Context c, MpesaParser.Item it) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Captured M-Pesa transactions", NotificationManager.IMPORTANCE_DEFAULT));
                b = new Notification.Builder(c, CHANNEL);
            } else {
                b = new Notification.Builder(c);
            }
            String amount = String.format(Locale.US, it.amount == Math.floor(it.amount) ? "%,.0f" : "%,.2f", it.amount);
            PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Added to PesaTrack")
                    .setContentText(it.description + " · Ksh " + amount + " · " + it.category)
                    .setContentIntent(open).setAutoCancel(true);
            nm.notify(it.id.hashCode(), b.build());
        } catch (Exception ignored) {}
    }
}
