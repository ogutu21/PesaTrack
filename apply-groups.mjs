// PesaTrack: file M-Pesa payments by type (Send Money / Buy Goods / Pay Bill / Withdrawals / Money Received) instead of "Other",
// replace the "Needs a category" card with a "Money out by person" list. Touches the web app and the Android parser.
// Run from the project root: node apply-groups.mjs
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
if (!existsSync("public/extras.js") || !readFileSync("public/script.js", "utf8").includes("initExtras")) { console.log("✗ Apply the home extras package first (node apply-extras.mjs), then run this."); process.exit(1); }

patch("public/mpesa.js", "export function fallbackCategory", [
    ["function toNumber(s)", `// When no name rule matches, file the payment under what kind of M-Pesa payment it was (like the M-Pesa statement does).
export function fallbackCategory(kind, type, party) {
    if (kind === "withdraw") return "Withdrawals";
    if (type === "income") return kind === "reversal" ? "Refunds" : "Money Received";
    if (kind === "paybill" || /\\bfor account\\b/i.test(party || "")) return "Pay Bill";
    if (kind === "paid") return "Buy Goods";
    if (kind === "sent") return "Send Money";
    return "Other";
}

function toNumber(s)`],
    ['const category = kind === "airtime" ? "Airtime & Data" : kind === "withdraw" ? "Other" : guessCategory(party, type);',
     'let category = kind === "airtime" ? "Airtime & Data" : kind === "withdraw" ? "Other" : guessCategory(party, type);\n    if (category === "Other") category = fallbackCategory(kind, type, party);']
]);
patch("public/statement.js", "classifyRow", [
    ['import { guessCategory } from "./mpesa.js";', 'import { guessCategory, fallbackCategory } from "./mpesa.js";'],
    ["function classify(r) {", `function classify(r) {
    const o = classifyRow(r);
    if (o.category === "Other" && !o.internal) o.category = fallbackCategory(o.kind, o.type, o.party);
    return o;
}

function classifyRow(r) {`]
]);
patch("public/categories.js", "Send Money", [
    ['    E("Pets", "🐾", "#c2410c"),', '    E("Pets", "🐾", "#c2410c"),\n    E("Send Money", "💸", "#0ea5e9"), E("Buy Goods", "🏪", "#f59e0b"), E("Pay Bill", "🧾", "#22c55e"), E("Withdrawals", "🏧", "#a855f7"),'],
    ['I("Refunds", "🔄", "#0284c7"), I("Loan Received", "🤲", "#9333ea"),', 'I("Refunds", "🔄", "#0284c7"), I("Loan Received", "🤲", "#9333ea"), I("Money Received", "📥", "#0891b2"),']
]);
patch("public/payee-core.js", "FALLBACK", [
    ["export const MAX_PAYEES = 200;", 'export const MAX_PAYEES = 200;\n// Catch-all groups are not remembered per payee, so the built-in guesses still apply.\nconst FALLBACK = new Set(["Other", "Send Money", "Buy Goods", "Pay Bill", "Withdrawals", "Money Received"]);'],
    ['if (!t || !t.category || t.category === "Other") continue;', "if (!t || !t.category || FALLBACK.has(t.category)) continue;"]
]);
patch("android/app/src/main/java/app/pesatrack/MpesaParser.java", "fallbackCategory", [
    ['        it.category = kind.equals("airtime") ? "Airtime & Data" : kind.equals("withdraw") ? "Other" : guessCategory(party, type);',
     '        it.category = kind.equals("airtime") ? "Airtime & Data" : kind.equals("withdraw") ? "Other" : guessCategory(party, type);\n        if (it.category.equals("Other")) it.category = fallbackCategory(kind, type, party);'],
    ["    private static Transfer parseTransfer(", `    static String fallbackCategory(String kind, String type, String party) {
        if (kind.equals("withdraw")) return "Withdrawals";
        if (type.equals("income")) return "Money Received";
        if (kind.equals("paybill") || Pattern.compile("\\\\bfor account\\\\b", CI).matcher(party == null ? "" : party).find()) return "Pay Bill";
        if (kind.equals("paid")) return "Buy Goods";
        if (kind.equals("sent")) return "Send Money";
        return "Other";
    }

    private static Transfer parseTransfer(`]
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: node tests/extras.test.mjs ; git add . ; git commit -m \"Group M-Pesa by type, money out by person\" ; git push origin main ; firebase deploy --only hosting");
process.exit(failed ? 1 : 0);
