package app.pesatrack;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.Locale;

// Runs when any SMS arrives. Only messages from MPESA are used; everything else is ignored and never leaves the phone.
public class SmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        String from = parts[0].getOriginatingAddress();
        if (from == null || !from.toUpperCase(Locale.ROOT).contains("MPESA")) return;
        StringBuilder sb = new StringBuilder();
        for (SmsMessage m : parts) sb.append(m.getMessageBody());
        final String text = sb.toString();
        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try { Sender.enqueue(app, text); Sender.flush(app); } finally { pending.finish(); }
        }).start();
    }
}
