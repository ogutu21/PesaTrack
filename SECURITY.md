# PesaTrack security notes

## Applying the hardening patch
1. `node apply-security.mjs` (safe to re-run). It changes code, `firebase.json` and `firestore.rules` (old rules saved as `firestore.rules.before-security`).
2. `firebase emulators:start --only hosting`, then use the app: sign in, add/edit/delete a transaction, import a statement, open Settings, log out and back in.
3. `firebase deploy --only hosting`
4. Check the Content Security Policy (it starts in report-only mode, so it cannot break anything):
   open the live app, open the browser console (F12), sign in with **both** email and Google, and use every page.
   Lines starting with `[Report Only] Refused to ...` are things the policy would block. No such lines means it is safe to enforce:
   `node apply-security.mjs --enforce` then `firebase deploy --only hosting`.
   Re-run `node apply-security.mjs` after editing an inline `<script>` in `index.html` or `auth.html` (it refreshes the hashes).
5. `firebase deploy --only firestore:rules`, then immediately: add a transaction, edit one, change a budget, import a few rows.
   If anything is refused, put `firestore.rules.before-security` back as `firestore.rules` and deploy the rules again.
6. Optional: `npm install --save-dev @firebase/rules-unit-testing firebase` then
   `npx firebase emulators:exec --only firestore "node tests/rules.test.mjs"` runs 24 rule checks.

## Firebase / Google Cloud console checklist (cannot be done from code)
- **API key restrictions** (Google Cloud Console > APIs & Services > Credentials > your browser key): restrict by HTTP referrer to
  `https://pesatrack-92632.web.app/*`, `https://pesatrack-92632.firebaseapp.com/*` and `http://localhost:*/*` (for the emulator).
- **Authentication > Settings**: authorized domains should list only your hosting domains; turn on *email enumeration protection*.
- **Realtime Database**: `firebase-config.js` names a Realtime Database. If it exists in the console, make sure its rules are
  `{ "rules": { ".read": false, ".write": false } }`, or delete the database if you don't use it.
- **App Check** (reCAPTCHA Enterprise): stops other apps and scripts using your Firebase project. Add it in "monitor" mode first.
- **Billing**: set a budget alert so abuse shows up as an email, not a surprise bill.
- **Backups**: enable Firestore point-in-time recovery or scheduled exports.

## Known limits
- The app lock (PIN / fingerprint) is a screen lock. Someone who can open browser developer tools on an unlocked device can bypass it; your login is the real security.
- Household members are trusted with each other's shared data; the patch stops one member's data from running code in another's browser, but a member can still delete or edit shared transactions.
