// PesaTrack: M-Shwari and KCB M-PESA savings balances. Run from the project root (the folder containing public/):
//   node apply-savings.mjs
// Safe to re-run. Then: firebase deploy --only hosting, firebase deploy --only firestore:rules
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

for (const f of ["savings.js", "savings.css", "mpesa.js", "inbox.js", "inbox-core.js"])
    if (!existsSync(join(pub, f))) { console.log(`✗ ${f}: missing, unzip the package into the project root first`); failed++; }

// ---------- Firestore rules ----------
const rules = [[/(\n[ \t]*)(\/\/ -+ shared households -+)/,
`$1// savings-v1: balances held in your own M-Shwari / KCB M-PESA, read from your M-Pesa messages. Only you can read or write them.
    match /users/{userId}/savings/{acct} {
      allow read, delete: if request.auth != null && request.auth.uid == userId;
      allow create, update: if request.auth != null && request.auth.uid == userId
        && acct in ['mshwari', 'kcb']
        && request.resource.data.keys().hasOnly(['balance', 'asOf', 'lastAmount', 'lastDir', 'lastDate', 'updatedAt'])
        && request.resource.data.balance is number && request.resource.data.balance >= 0 && request.resource.data.balance < 1000000000000
        && request.resource.data.lastAmount is number && request.resource.data.lastAmount >= 0 && request.resource.data.lastAmount < 1000000000000
        && request.resource.data.lastDir in ['in', 'out']
        && request.resource.data.asOf is string && request.resource.data.asOf.size() <= 16
        && request.resource.data.lastDate is string && request.resource.data.lastDate.size() <= 10
        && request.resource.data.updatedAt is string && request.resource.data.updatedAt.size() <= 40;
    }
$1$2`]];
patch("firestore.rules", "savings-v1", rules, root);
patch("security/firestore.rules", "savings-v1", rules, root);   // the copy kept by the security package, if present

// ---------- app wiring ----------
patch("script.js", "initSavings", [
    ['import { initInbox } from "./inbox.js";', 'import { initInbox } from "./inbox.js";\nimport { initSavings } from "./savings.js";'],
    ['const inbox = initInbox({ $, toast, confirmDialog, escapeHTML });', 'const inbox = initInbox({ $, toast, confirmDialog, escapeHTML });\nconst savings = initSavings({ $, escapeHTML, formatCurrency });'],
    ['    inbox.onUser(user);\n', '    inbox.onUser(user);\n    savings.onUser(user);\n']
]);
patch("index.html", "savings.css", [['<link rel="stylesheet" href="dashboard.css">', '<link rel="stylesheet" href="dashboard.css">\n    <link rel="stylesheet" href="savings.css">']]);
patch("service-worker.js", '"/savings.js"', [
    ['"/inbox-core.js",', '"/inbox-core.js", "/savings.js", "/savings.css",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);

console.log(failed ? `\n${failed} problem(s). Nothing was half-applied; send me the lines above.` : "\nDone. Next: firebase deploy --only hosting, then firebase deploy --only firestore:rules");
process.exit(failed ? 1 : 0);
