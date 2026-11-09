// Hides "Continue with Google" inside the Android app only. Run from the project root:  node apply-auth-app.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const pub = join(process.argv[2] || ".", "public");
let failed = 0;
function patch(file, marker, edits) {
    const path = join(pub, file);
    if (!existsSync(path)) { console.log(`✗ ${file}: not found`); failed++; return; }
    let text = readFileSync(path, "utf8");
    const crlf = text.includes("\r\n");
    if (crlf) text = text.replace(/\r\n/g, "\n");
    if (text.includes(marker)) { console.log(`• ${file}: already patched, skipped`); return; }
    for (const [find, replace] of edits) {
        if (!(typeof find === "string" ? text.includes(find) : find.test(text))) { console.log(`✗ ${file}: anchor not found, file left unchanged`); failed++; return; }
        text = typeof find === "string" ? text.replace(find, () => replace) : text.replace(find, replace);
    }
    writeFileSync(path, crlf ? text.replace(/\n/g, "\r\n") : text);
    console.log(`✓ ${file}: patched`);
}
console.log(existsSync(join(pub, "auth-app.js")) ? "✓ auth-app.js: present" : (failed++, "✗ auth-app.js: missing, unzip the package first"));
patch("auth.html", "auth-app.js", [[/\n<\/body>/, '\n<script src="/auth-app.js"></script>\n</body>']]);
patch("service-worker.js", '"/auth-app.js"', [
    ['"/auth.html",', '"/auth.html", "/auth-app.js",'],
    [/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}";`]
]);
console.log(failed ? `\n${failed} problem(s), nothing half-applied.` : "\nDone. Next: firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
