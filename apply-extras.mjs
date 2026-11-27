// PesaTrack: review list, M-Pesa fee breakdown, spending changes in words, and a hide-amounts button. Website only.
// Run from the project root:  node apply-extras.mjs  then  node tests/extras.test.mjs
// Then: git add . ; git commit -m "Home extras" ; git push origin main ; firebase deploy --only hosting
import { readFileSync, writeFileSync, existsSync } from "node:fs";
let failed = 0;
function patch(file, marker, edits) {
    if (!existsSync(file)) { console.log(`✗ ${file}: not found (run from the project root)`); failed++; return; }
    let text = readFileSync(file, "utf8"); const crlf = text.includes("\r\n"); if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        const n = typeof find === "string" ? text.split(find).length - 1 : (text.match(new RegExp(find.source, "g")) || []).length;
        if (n !== 1) { console.log(`✗ ${file}: ${n ? "anchor matches " + n + " places" : "anchor not found"}, left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return; }
        text = typeof find === "string" ? text.replace(find, () => replace) : text.replace(find, replace);
    }
    writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text); console.log(`✓ ${file}: patched`);
}
for (const f of ["public/extras.js", "public/extras-core.js", "public/extras.css", "public/payee-core.js"]) if (!existsSync(f)) { console.log(`✗ ${f} is missing: unzip the package into the project root first (payee-core.js comes from the earlier payee update)`); process.exit(1); }

patch("public/index.html", "extras.css", [
    ['<link rel="stylesheet" href="savings.css">', '<link rel="stylesheet" href="savings.css">\n    <link rel="stylesheet" href="extras.css">']
]);
patch("public/script.js", "initExtras", [
    ['import "./app-update.js";', 'import "./app-update.js";\nimport { initExtras } from "./extras.js";'],
    ["// ---------- quick-add bottom sheet (phones) ----------",
`// ---------- review list, fees, spending in words, hide amounts ----------
const extras = initExtras({
    $, escapeHTML, formatCurrency, formatDate, monthLabel, shiftMonth, localToday, categoriesFor, toast,
    getAll: () => transactions, getMonth: () => selectedMonth,
    saveTx: tx => saveTransaction(currentUser.uid, tx).catch(reportWriteError)
});

// ---------- quick-add bottom sheet (phones) ----------`],
    ["    features.render();\n    home.render();\n}", "    features.render();\n    home.render();\n    extras.render();\n}"]
]);
patch("public/service-worker.js", '"/extras.js"', [
    ['"/savings.css",', '"/savings.css", "/extras.js", "/extras-core.js", "/extras.css", "/payee-core.js",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: node tests/extras.test.mjs ; git add . ; git commit -m \"Home extras\" ; git push origin main ; firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
