// Adds the home extras (action buttons, frequent payees, vs-last-month chip, Insights tabs).
// Usage (from the project root, the folder that contains public/):  node apply-home.mjs
// Safe to re-run. A file is only written if every anchor in it was found.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const pub = join(process.argv[2] || ".", "public");
let failed = 0;
function patch(file, marker, edits) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found in ${pub}`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");   // Windows checkouts use CRLF; patch as LF, write back as CRLF
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) { console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return; }
        text = typeof find === "string" ? text.split(find).join(replace) : text.replace(find, replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}
for (const f of ["home.js", "dashboard.css", "charts.js"]) if (!existsSync(join(pub, f))) { console.log(`✗ missing public/${f}: unzip the package into the project root first`); failed++; }

patch("script.js", "initHome", [
    ['import { initAttention } from "./attention.js";', 'import { initAttention } from "./attention.js";\nimport { initHome } from "./home.js";'],
    ["// ---------- quick-add bottom sheet (phones) ----------",
`// ---------- home extras: action buttons, frequent payees, Insights tabs ----------
const home = initHome({
    $, escapeHTML, formatCurrency, colorFor, totalsFor, inMonth, shiftMonth, monthLabel,
    getAll: () => transactions, getVisible: visible, getMonth: () => selectedMonth,
    openGoals: () => { openSection("dashboard"); setTimeout(() => $("dashWidgets").scrollIntoView({ behavior: "smooth" }), 250); },
    addTx(type, f = {}) {
        if (!$("dashboard").classList.contains("active")) openSection("dashboard");
        if (matchMedia("(max-width: 800px)").matches) setSheet(true);
        else setTimeout(() => $("quickAddCard").scrollIntoView({ behavior: "smooth", block: "center" }), 60);
        if (type) { $("type").value = type; fillSelect($("category"), type, f.category || ""); }
        if (f.description != null) $("description").value = f.description;
        if (f.amount != null) $("amount").value = f.amount;
        setTimeout(() => $(f.description != null ? "amount" : "description").focus(), 320);
    }
});

// ---------- quick-add bottom sheet (phones) ----------`],
    [/(\n[ \t]*renderCharts\(\);\s*\n[ \t]*features\.render\(\);)/, "$1\n    home.render();"]
]);
patch("service-worker.js", "/home.js", [
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${Number(n) + 1}";`],
    ['"/refine.css",', '"/refine.css", "/home.js",']
]);
console.log(failed ? `\n${failed} problem(s). Nothing was broken: fix and run again.` : "\nDone. Test:  firebase emulators:start --only hosting   Deploy:  firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
