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
