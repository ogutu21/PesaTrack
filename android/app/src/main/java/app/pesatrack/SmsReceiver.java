package app.pesatrack;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.Locale;

// Runs when any SMS arrives. Only messages from M-Pesa, M-Shwari or KCB senders are used; everything else is ignored and never leaves the phone.
public class SmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        String from = parts[0].getOriginatingAddress();
        if (from == null) return;
        String sender = from.toUpperCase(Locale.ROOT).replaceAll("[^A-Z]", "");   // "M-PESA", "MPESA", "M-Shwari", "KCB" ...
        boolean ours = sender.contains("MPESA") || sender.contains("SHWARI") || sender.contains("KCB");
        android.util.Log.i("PesaTrack", "SMS received, sender=" + sender + ", used=" + ours);
        if (!ours) return;
        StringBuilder sb = new StringBuilder();
        for (SmsMessage m : parts) sb.append(m.getMessageBody());
        final String text = sb.toString();
        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                android.util.Log.i("PesaTrack", "configured=" + Sender.configured(app));
                Sender.enqueue(app, text); Sender.flush(app);
            } catch (Throwable t) {
                android.util.Log.w("PesaTrack", "receiver error", t);
            } finally { pending.finish(); }
        }).start();
    }
}
