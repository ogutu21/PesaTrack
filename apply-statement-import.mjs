// Adds "Import M-Pesa statement (PDF)" to PesaTrack.
// Usage (from the project root, the folder that contains public/):  node apply-statement-import.mjs
// Safe to re-run. A file is only written if every anchor in it was found.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const pub = join(process.argv[2] || ".", "public");
let failed = 0;

function patch(file, marker, edits) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found in ${pub}`); failed++; return; }
    let text = readFileSync(path, "utf8");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) {
            console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return;
        }
        text = typeof find === "string" ? text.split(find).join(replace) : text.replace(find, replace);
    }
    writeFileSync(path, text);
    console.log(`✓ ${file}: patched`);
}

for (const f of ["statement.js", "statement-pdf.js", "statement-ui.js", "mpesa.js", "vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"])
    if (!existsSync(join(pub, f))) { console.log(`✗ missing public/${f}: unzip the package into the project root first`); failed++; }

// a second button next to every "Import M-Pesa" button
patch("index.html", "data-open-statement", [
    [/^([ \t]*)(<button[^>\n]*data-open-mpesa[^>\n]*>[^\n]*<\/button>)[ \t]*$/gm,
        (m, ind, btn) => `${m}\n${ind}<button type="button" class="secondary-button" data-open-statement>📄 Import statement (PDF)</button>`]
]);

patch("script.js", "openStatementImport", [
    ['import { parseMpesa } from "./mpesa.js";', 'import { parseMpesa } from "./mpesa.js";\nimport { openStatementImport } from "./statement-ui.js";'],
    ['document.querySelectorAll("[data-open-mpesa]").forEach(b => b.addEventListener("click", openMpesaImport));',
`document.querySelectorAll("[data-open-mpesa]").forEach(b => b.addEventListener("click", openMpesaImport));

// Import a whole M-Pesa statement (PDF)
document.querySelectorAll("[data-open-statement]").forEach(b => b.addEventListener("click", () => {
    if (!currentUser) return;
    openStatementImport({
        openOverlay, categoriesFor, getCategoryIcon, escapeHTML, formatCurrency, formatDate, toast,
        importTransactions, reportWriteError,
        uid: () => currentUser.uid,
        existingIds: () => new Set(transactions.map(t => t.id)),
        onImported: txs => {
            if (selectedMonth !== "all" && !txs.some(t => monthKey(t.date) === selectedMonth)) {
                selectedMonth = monthKey(txs.map(t => t.date).sort().pop());
            }
        }
    });
}));`]
]);

patch("service-worker.js", "statement-ui.js", [
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${Number(n) + 1}";`],
    ['"/attention.js",', '"/attention.js", "/statement.js", "/statement-pdf.js", "/statement-ui.js",']
]);

patch("refine.css", "statement import", [
    [/$/, `

/* ---- statement import ---- */
.mp-controls { display: grid; gap: 8px; margin: 12px 0; }
.mp-controls input[type="date"] { margin-left: 8px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
#stFile { width: 100%; margin: 6px 0; }
`]
]);

console.log(failed ? `\n${failed} problem(s). Nothing was broken: fix them and run again.` : "\nDone. Test with:  firebase emulators:start --only hosting   then deploy with:  firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
