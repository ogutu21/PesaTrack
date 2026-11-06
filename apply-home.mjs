// Adds the home extras (quick actions, frequent payees, vs-last-month chip, avatar) and the Insights tabs on Reports.
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
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!text.includes(find)) { console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${find.slice(0, 90)}`); failed++; return; }
        text = text.split(find).join(replace);
    }
    writeFileSync(path, text);
    console.log(`✓ ${file}: patched`);
}
for (const f of ["home.js", "dashboard.css", "charts.js", "categories.js"]) if (!existsSync(join(pub, f))) { console.log(`✗ missing public/${f}: unzip the package into the project root first`); failed++; }

// donut centre label ("Spent" by default, "Earned" for income)
patch("charts.js", 'label = "Spent"', [
    ["export function donutHTML(entries, formatMoney) {", 'export function donutHTML(entries, formatMoney, label = "Spent") {'],
    ['class="donut-label">Spent</text>', 'class="donut-label">${esc(label)}</text>']
]);

patch("script.js", "initHome", [
    ['import { initAttention } from "./attention.js";', 'import { initAttention } from "./attention.js";\nimport { initHome } from "./home.js";'],
    ["// ---------- app lock (PIN / fingerprint) ----------",
`// ---------- home extras: quick actions, frequent payees, Insights tabs ----------
const home = initHome({
    $, escapeHTML, formatCurrency, colorFor, monthLabel, totalsFor, inMonth, shiftMonth,
    getAll: () => transactions, getVisible: visible, getMonth: () => selectedMonth,
    go(name) {
        if (name === "goals") { openSection("dashboard"); setTimeout(() => $("dashWidgets").scrollIntoView({ behavior: "smooth" }), 250); }
        else openSection(name);
    },
    addTx(type, pre) {
        if (!$("dashboard").classList.contains("active")) openSection("dashboard");
        if (window.matchMedia("(max-width: 800px)").matches) setSheet(true);
        if (type) { $("type").value = type; fillSelect($("category"), type, ""); }
        if (pre) {
            $("description").value = pre.description || "";
            $("amount").value = pre.amount || "";
            if (pre.category) fillSelect($("category"), type || $("type").value, pre.category);
        }
        setTimeout(() => ($("amount").value ? $("amount") : $("description")).focus(), 350);
    }
});

// ---------- app lock (PIN / fingerprint) ----------`],
    ["    renderCharts();\n    features.render();", "    renderCharts();\n    features.render();\n    home.render();"]
]);

// service worker needs a regex for the version bump, so it is handled on its own
{
    const path = join(pub, "service-worker.js");
    let text = readFileSync(path, "utf8");
    if (text.includes('"/home.js"')) console.log("• service-worker.js: already patched, skipped");
    else if (!text.includes('"/attention.js",') && !text.includes('"/dashboard.css",')) { console.log("✗ service-worker.js: anchor not found, file left unchanged"); failed++; }
    else {
        text = text.replace(/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${Number(n) + 1}";`)
            .replace(text.includes('"/dashboard.css",') ? '"/dashboard.css",' : '"/attention.js",', m => `${m} "/home.js",`);
        writeFileSync(path, text); console.log("✓ service-worker.js: patched");
    }
}
console.log(failed ? `\n${failed} problem(s). Nothing was broken: fix and run again.` : "\nDone. Test:  firebase emulators:start --only hosting   Deploy:  firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
