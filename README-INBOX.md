# Automatic M-Pesa capture

1. Unzip into the project root (the folder that contains `public/`), then run:  `node apply-inbox.mjs`
2. Deploy:  `firebase deploy --only hosting`  then  `firebase deploy --only firestore:rules`
3. Open PesaTrack > Settings > Automatic M-Pesa capture > Turn on.
4. On your Android phone, install MacroDroid (free) and make one macro:
   - Trigger: SMS received, sender MPESA
   - Action: HTTP request, POST, content type application/json
   - Address and Body: copy them from the card (Copy buttons)
   - Header: Referer = https://pesatrack-92632.web.app/   (needed if you restricted your API key by website)
5. Send yourself a test M-Pesa, or tap "Test" in the macro. Open PesaTrack: the transaction appears.

Notes
- New transactions go to your personal space, not a shared household.
- Messages are added when PesaTrack is open or the next time you open it.
- Keep the key private. "New key" replaces it (update the macro afterwards). "Turn off" makes your inbox refuse messages.
