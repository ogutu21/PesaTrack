// Applies the PesaTrack refinements to your existing files.
// Usage (from the project root):  node apply-refinements.mjs
// Safe to re-run: files that are already patched are skipped, and a file is only written
// if EVERY anchor in it was found (otherwise it is left untouched and the problem is reported).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || ".";
const pub = join(root, "public");
let failed = 0;

function patch(file, marker, edits) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found in ${pub}`); failed++; return; }
    let text = readFileSync(path, "utf8");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        const found = typeof find === "string" ? text.includes(find) : find.test(text);
        if (!found) { console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return; }
        text = typeof find === "string"
            ? text.split(find).join(typeof replace === "function" ? replace(find) : replace)
            : text.replace(find, typeof replace === "function" ? replace : () => replace);
    }
    writeFileSync(path, text);
    console.log(`✓ ${file}: patched`);
}

// ---------------------------------------------------------------- index.html
patch("index.html", "refine.css", [
    // load the new stylesheet last
    ['<link rel="stylesheet" href="style.css">',
        '<link rel="stylesheet" href="style.css">\n    <link rel="stylesheet" href="refine.css">'],
    // budget banner -> attention strip
    ['<div id="budgetBanner" class="budget-banner" hidden></div>',
        '<section id="attention" class="attention" aria-label="Needs your attention" hidden></section>'],
    // give the Quick Add card an id + class so it can become a bottom sheet on phones
    [/<div class="card">(\s*<div class="card-header">\s*<div>\s*<h3>Quick Add Transaction<\/h3>)/,
        (_, rest) => `<div class="card quick-add" id="quickAddCard">${rest}`],
    // floating + button and sheet backdrop
    ["<!-- MOBILE NAVIGATION -->",
        `<button type="button" id="fabAdd" class="fab" aria-label="Add transaction">+</button>\n<div id="sheetBackdrop" class="sheet-backdrop" hidden></div>\n\n<!-- MOBILE NAVIGATION -->`],
    // the form is no longer "above" on phones
    ["Add your first transaction above.", "Add your first transaction to get started."]
]);

// ---------------------------------------------------------------- script.js
patch("script.js", "initAttention", [
    ['import { initHousehold } from "./household.js";',
        'import { initHousehold } from "./household.js";\nimport { initAttention } from "./attention.js";'],

    // sync status: keep a readable label for the dot on phones
    ['el.textContent = state === "online" ? "☁️ Synced" : state === "offline" ? "Offline — saved on device" : "Syncing…";',
        'el.textContent = state === "online" ? "☁️ Synced" : state === "offline" ? "Offline — saved on device" : "Syncing…";\n    el.title = el.textContent; el.setAttribute("aria-label", el.textContent);'],

    // close the sheet after a transaction is added
    ['toast("Transaction added", "success");', 'toast("Transaction added", "success");\n    setSheet(false);'],

    // the old budget banner is replaced by the attention strip
    [/function renderBanner\(\) \{[\s\S]*?\r?\n\}\r?\n/,
        () => "function renderBanner() { attention.render(); }\n"],

    // features re-render (goals / recurring change) should refresh the strip too
    ["afterRender: renderDashTab,", "afterRender: () => { renderDashTab(); renderBanner(); },"],

    // budget notes get a text/icon status, not colour alone
    ['<div class="budget-note">${left >= 0 ?',
        '<div class="budget-note">${{ over: "🚨", warn: "⚠️", ok: "✓" }[level]} ${left >= 0 ?'],

    ["Add your first transaction above.", "Add your first transaction to get started."],

    // new blocks: attention strip + quick-add sheet
    ["// ---------- app lock (PIN / fingerprint) ----------", `// ---------- "needs attention" strip ----------
const attention = initAttention({
    escapeHTML, formatCurrency, formatDate, localToday, monthLabel, currentMonthKey,
    spentByCategory, budgetMonth, getBudgets: () => budgets, getFeatureData: () => features.getData(),
    go(kind) {
        if (kind === "budgets") openSection("reports");
        else if (kind === "recurring") { openSection("dashboard"); dashTab = "upcoming"; renderDashTab(); }
        else if (kind === "goals") { openSection("dashboard"); setTimeout(() => $("dashWidgets").scrollIntoView({ behavior: "smooth" }), 250); }
    }
});

// ---------- quick-add bottom sheet (phones) ----------
const quickAdd = $("quickAddCard");
{
    const x = document.createElement("button");
    x.type = "button"; x.className = "sheet-close"; x.setAttribute("aria-label", "Close"); x.textContent = "×";
    x.addEventListener("click", () => setSheet(false));
    quickAdd.prepend(x);
}
function setSheet(open) {
    quickAdd.classList.toggle("sheet-open", open);
    $("sheetBackdrop").hidden = !open;
    document.body.classList.toggle("sheet-lock", open);
    if (open) setTimeout(() => $("description").focus(), 300);
}
$("fabAdd").addEventListener("click", () => {
    if (!$("dashboard").classList.contains("active")) openSection("dashboard");
    setSheet(true);
});
$("sheetBackdrop").addEventListener("click", () => setSheet(false));
document.addEventListener("keydown", e => { if (e.key === "Escape" && quickAdd.classList.contains("sheet-open")) setSheet(false); });

// ---------- app lock (PIN / fingerprint) ----------`]
]);

// ---------------------------------------------------------------- features.js
patch("features.js", "Near limit", [
    ["${esc(cat)}</span><span>${pct.toFixed(0)}%</span></div>",
        '${esc(cat)}</span><span>${{ over: "🚨 Over", warn: "⚠️ Near limit", ok: "✓ On track" }[level]} · ${pct.toFixed(0)}%</span></div>']
]);

// ---------------------------------------------------------------- service-worker.js
patch("service-worker.js", "attention.js", [
    ['const VERSION = "pesatrack-v14";', 'const VERSION = "pesatrack-v15";'],
    ['"/recurrence.js", "/manifest.json",', '"/recurrence.js", "/attention.js", "/refine.css", "/manifest.json",']
]);

console.log(failed ? `\n${failed} file(s) need attention. Nothing was half-applied.` : "\nAll done. Run: firebase emulators:start --only hosting");
process.exit(failed ? 1 : 0);
