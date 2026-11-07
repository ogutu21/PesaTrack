// PesaTrack: automatic M-Pesa capture. Run from the project root (the folder containing public/):
//   node apply-inbox.mjs
// Safe to re-run. After it: deploy hosting, then deploy the Firestore rules (see README-INBOX.md).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || ".";
const pub = join(root, "public");
let failed = 0;

function patch(file, marker, edits, base = pub) {
    const path = join(base, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) {
            console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 100)}`); failed++; return;
        }
        text = typeof find === "string" ? text.replace(find, () => replace) : text.replace(find, replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}

for (const f of ["inbox.js", "inbox-core.js"])
    console.log(existsSync(join(pub, f)) ? `✓ ${f}: present` : (failed++, `✗ ${f}: missing, unzip the package into the project root first`));

// ---------- Firestore rules ----------
const rules = [
    [/(data\.keys\(\)\.hasOnly\(\[)('limits', 'items', 'base', 'rates', )('updatedAt'\]\))/, "$1$2'secret', $3"],
    [/(\n\s*)(\|\| \(docId == 'currency')/,
     "$1|| (docId == 'ingest' && data.secret is string && data.secret.size() >= 32 && data.secret.size() <= 64)$1$2"],
    [/(\n[ \t]*)(\/\/ -+ shared households -+)/,
`$1// inbox-v1: your phone's automation app drops M-Pesa SMS text here. Only you can read or delete it.
    // Creating a message needs your private key (stored in your settings, readable only by you); no edits.
    match /users/{userId}/inbox/{msgId} {
      allow read, delete: if request.auth != null && request.auth.uid == userId;
      allow create: if request.resource.data.keys().hasOnly(['text', 'secret'])
        && request.resource.data.text is string
        && request.resource.data.text.size() >= 20 && request.resource.data.text.size() <= 1000
        && request.resource.data.secret is string
        && exists(/databases/$(database)/documents/users/$(userId)/settings/ingest)
        && request.resource.data.secret == get(/databases/$(database)/documents/users/$(userId)/settings/ingest).data.secret;
      allow update: if false;
    }
$1$2`]
];
patch("firestore.rules", "inbox-v1", rules, root);
patch("security/firestore.rules", "inbox-v1", rules, root);   // the copy kept by the security package, if present

// ---------- app wiring ----------
patch("script.js", "initInbox", [
    ['import { initHome } from "./home.js";', 'import { initHome } from "./home.js";\nimport { initInbox } from "./inbox.js";'],
    ['const appLock = initAppLock({ $, toast, confirmDialog, escapeHTML, logout });',
     'const appLock = initAppLock({ $, toast, confirmDialog, escapeHTML, logout });\nconst inbox = initInbox({ $, toast, confirmDialog, escapeHTML });'],
    ['    appLock.onUser(user);\n', '    appLock.onUser(user);\n    inbox.onUser(user);\n']
]);
patch("service-worker.js", '"/inbox.js"', [
    ['"/statement-ui.js",', '"/statement-ui.js", "/inbox.js", "/inbox-core.js",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);

console.log(failed ? `\n${failed} problem(s). Nothing was half-applied; send me the lines above.` : "\nDone. Next: firebase deploy --only hosting, then firebase deploy --only firestore:rules");
process.exit(failed ? 1 : 0);
