// Adds the dark-premium dashboard styling to PesaTrack.
// Usage (from the project root, the folder that contains public/):  node apply-dashboard.mjs
// Safe to re-run. To undo: delete the dashboard.css <link> line from public/index.html.
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
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) { console.log(`✗ ${file}: anchor not found, file left unchanged:\n    ${String(find).slice(0, 90)}`); failed++; return; }
        text = typeof find === "string" ? text.split(find).join(replace) : text.replace(find, replace);
    }
    writeFileSync(path, text);
    console.log(`✓ ${file}: patched`);
}
if (!existsSync(join(pub, "dashboard.css"))) { console.log("✗ public/dashboard.css missing: unzip the package into the project root first"); failed++; }

patch("index.html", "dashboard.css", [['<link rel="stylesheet" href="refine.css">', '<link rel="stylesheet" href="refine.css">\n    <link rel="stylesheet" href="dashboard.css">']]);
patch("service-worker.js", "/dashboard.css", [
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${Number(n) + 1}";`],
    ['"/refine.css",', '"/refine.css", "/dashboard.css",']
]);
console.log(failed ? `\n${failed} problem(s). Nothing was broken: fix and run again.` : "\nDone. Test:  firebase emulators:start --only hosting   Deploy:  firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
