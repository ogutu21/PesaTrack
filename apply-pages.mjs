// Swaps the leftover emoji in buttons for line icons (cosmetic only, no behaviour change).
// Usage (from the project root, the folder that contains public/):  node apply-pages.mjs
// Safe to re-run; skips the file if already done. Needs public/dashboard.css from this package (it styles .ico).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const file = join(process.argv[2] || ".", "public", "index.html");
if (!existsSync(file)) { console.log(`✗ ${file} not found. Run this from the project root.`); process.exit(1); }
let text = readFileSync(file, "utf8");
if (text.includes('class="ico"')) { console.log("• index.html: icons already swapped, skipped"); process.exit(0); }

const svg = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    import: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"/>'),
    export: svg('<path d="M12 15V3m0 0L8 7m4-4l4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')
};
// [emoji + label as written in index.html, icon, label]
const swaps = [
    ["📲 Import M-Pesa", "import"], ["📄 Import statement (PDF)", "file"], ["⬇ Export CSV", "export"], ["📄 Summary report", "file"],
    ["⚙ Customize", "sliders"], ["⬇ Download backup", "export"], ["🗑 Clear All", "trash"], ["🚪 Logout", "logout"]
];
let n = 0;
for (const [from, icon] of swaps) {
    const label = from.replace(/^\S+\s/, "");
    if (text.includes(from)) { text = text.split(from).join(ICON[icon] + label); n++; }
}
// search box: a bare 🔍 on its own line
const before = text;
text = text.replace(/(<div class="search-box">\s*)🔍/, `$1${ICON.search}`);
if (text !== before) n++;
if (!n) { console.log("✗ none of the expected buttons were found; nothing changed."); process.exit(1); }
writeFileSync(file, text);
console.log(`✓ index.html: ${n} icon group(s) swapped`);
