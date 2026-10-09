# PesaTrack

## Project layout
- `public/`  – the web app (index.html, auth.html, script.js, firestore.js, firebase-config.js, PWA files)
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc` – Firebase config

## Features
- Cloud sync (Firestore) with offline support
- Month-by-month view with comparison to the previous month
- Monthly budgets per category, with warnings at 80% and 100%
- Charts: spending by category, 6-month income vs expenses
- CSV export (Excel-friendly)
- M-Pesa SMS import: paste messages, review, import (re-pasting never creates duplicates)

- Customizable dashboard (show/hide cards) with insights: daily average, biggest expense, month-end forecast, "safe to spend today"
- 39 built-in categories (28 expense, 12 income incl. Other) plus your own custom ones; dropdowns follow the transaction type
- Coinly-inspired look: warm charcoal dark theme (default) and a light theme, glowing sparklines on stat cards, Income / Spent / Left tiles, Activity tabs (Recent | Coming up)
- Motion: count-up numbers, bars and charts that grow in, staggered entrance, page transitions (all off when the device asks for reduced motion)
- Tags and notes on transactions, with search and tag filters
- Multi-currency: add a transaction in USD, EUR, etc.; it is converted to your main currency and the original is kept
- One-page summary report: print / save as PDF, share or copy as text
- Backup and restore: download everything as JSON; restore by merging or replacing
- Shared households: a separate shared space (transactions, budgets, goals) for family or a partner, joined with an invite code
- App lock: PIN plus fingerprint/face unlock (phone biometrics via WebAuthn), auto-lock, lockout after 5 wrong PINs
- Savings goals with progress and a suggested monthly amount
- Recurring transactions (weekly / monthly / yearly) that add themselves when due

## One-time setup
1. `npm install -g firebase-tools`
2. `firebase login`
3. Firebase Console → Build → **Authentication** → enable *Email/Password* (and *Google* if you use it)
4. Firebase Console → Build → **Firestore Database** → create it if you haven't
5. Authentication → Settings → **Authorized domains**: make sure your hosting domain is listed

## Deploy
    firebase deploy

Deploy the rules first if you're in a hurry (the old rules expire on 2026-11-04):

    firebase deploy --only firestore:rules

## Test locally
    firebase emulators:start --only hosting
(Opening the HTML files directly with file:// will not work: the app uses ES modules.)

## Cleanup of your old project
- Delete the old package.json / package-lock.json (no npm dependencies are needed)
- skills-lock.json is AI-tool metadata; it's git-ignored

## Adding M-Pesa transactions (free plan)
- **Android:** install the app, then in Messages long-press an M-Pesa SMS → Share → PesaTrack.
- **Any phone:** copy the SMS, open PesaTrack → Import M-Pesa → Paste.
Everything runs on the free Spark plan; no Cloud Functions are used.

## Testing shared households (do this once after deploying)
The household security rules cannot be tested offline, so check them with two accounts (A and B):
1. A: Settings -> Household -> Create. Add a transaction. Copy the invite code.
2. B: Settings -> Household -> Join with a code. B should see A's transaction and be able to add one.
3. B: Leave. B should be returned to Personal and lose access.
4. A: "New code", then try the OLD code from B. It must be rejected.
5. Check that B's personal space never shows A's personal data.
If any step fails, personal data is unaffected: only the household feature uses the new rules.
