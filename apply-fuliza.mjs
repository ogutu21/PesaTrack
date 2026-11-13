// PesaTrack: Fuliza tracking (access fee as an expense, amount owed, due date). Run from the project root:
//   node apply-fuliza.mjs   then  node tests/fuliza.test.mjs  and  node tests/parity.mjs public/mpesa.js
// Then: firebase deploy --only hosting, firebase deploy --only firestore:rules, git push (rebuilds the app).
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
const jv = "android/app/src/main/java/app/pesatrack/";
if (!existsSync("public/mpesa.js") || !existsSync(jv + "Sender.java")) { console.log("✗ run this from the project root (the folder containing public/ and android/)"); process.exit(1); }

// ---------- website: parser ----------
patch("public/mpesa.js", "parseFuliza", [
    ["function parseOne({ code, body }) {\n    const tr = parseTransfer(body, code);\n    if (tr) return tr.skip ? { skip: tr.skip } : { transfer: tr.transfer };",
`// Fuliza (M-Pesa overdraft). Borrowing is not new spending (the purchase has its own message) but the access fee is, and what you owe is tracked.
// Repaying is not spending either (the money was spent when you borrowed it). These messages carry no date, so today's date is used.
const pad2 = n => String(n).padStart(2, "0");
function nowStamp() {
    const d = new Date(), date = \`\${d.getFullYear()}-\${pad2(d.getMonth() + 1)}-\${pad2(d.getDate())}\`;
    return { date, asOf: \`\${date}T\${pad2(d.getHours())}:\${pad2(d.getMinutes())}\` };
}

function parseFuliza(body, code) {
    if (!/fuliza/i.test(body) || /(sent to|paid to|received)/i.test(body)) return null;
    const { date, asOf } = nowStamp();
    const lim = body.match(new RegExp("Available Fuliza M-?PESA limit is\\\\s+" + AMOUNT, "i"));
    const dm = body.match(new RegExp("due on\\\\s+" + DATE, "i"));
    const base = { code, account: "fuliza", date, asOf, due: dm ? toISODate(dm[1], dm[2], dm[3]) : null, limit: lim ? toNumber(lim[1]) : null, fee: 0 };
    const rp = body.match(new RegExp(AMOUNT + "\\\\s+from your M-?PESA has been used to\\\\s+(?:(fully|partially)\\\\s+)?pay your outstanding Fuliza", "i"));
    if (rp) {
        let balance = 0;
        if (!/^fully$/i.test(rp[2] || "")) {
            const o = body.slice(rp.index + rp[0].length).match(new RegExp("outstanding[^.]*?\\\\bis\\\\s+" + AMOUNT, "i"));
            if (!o) return null;
            balance = toNumber(o[1]);
        }
        return { transfer: { ...base, dir: "in", amount: toNumber(rp[1]), balance } };
    }
    const dr = body.match(new RegExp("Fuliza M-?PESA amount is\\\\s+" + AMOUNT, "i"));
    const out = body.match(new RegExp("Total Fuliza M-?PESA outstanding amount is\\\\s+" + AMOUNT, "i"));
    if (!dr || !out) return null;
    const fm = body.match(new RegExp("Access Fee charged\\\\s+" + AMOUNT, "i"));
    const fee = fm ? toNumber(fm[1]) : 0;
    const res = { transfer: { ...base, dir: "out", amount: toNumber(dr[1]), balance: toNumber(out[1]), fee } };
    if (fee > 0) res.item = { id: \`mpesa-\${code}-fzfee\`, code, kind: "fuliza-fee", type: "expense", amount: fee, fee: 0, date, description: \`Fuliza access fee (\${code})\`, category: "Fees & Charges" };
    return res;
}

function parseOne({ code, body }) {
    const tr = parseTransfer(body, code);
    if (tr) return tr.skip ? { skip: tr.skip } : { transfer: tr.transfer };
    const fz = parseFuliza(body, code);
    if (fz) return fz;`],
    [`            if (!seen.has(key)) { seen.add(key); transfers.push(r.transfer); skipped.push({ reason: "Savings transfer (not counted as spending)", text: msg.body.slice(0, 80) }); }`,
     `            if (!seen.has(key)) {
                seen.add(key); transfers.push(r.transfer);
                skipped.push({ reason: r.transfer.account === "fuliza" ? "Fuliza balance (not counted as spending)" : "Savings transfer (not counted as spending)", text: msg.body.slice(0, 80) });
                if (r.item && !seen.has(r.item.id)) { seen.add(r.item.id); items.push(r.item); }
            }`]
]);
patch("public/inbox.js", "t.due", [
    ["await setDoc(ref, { balance: t.balance, asOf: t.asOf, lastAmount: t.amount, lastDir: t.dir, lastDate: t.date, updatedAt: new Date().toISOString() });",
     "await setDoc(ref, { balance: t.balance, asOf: t.asOf, lastAmount: t.amount, lastDir: t.dir, lastDate: t.date, ...(t.due ? { due: t.due } : {}), ...(t.limit != null ? { limit: t.limit } : {}), updatedAt: new Date().toISOString() });"]
]);

// ---------- website: home screen card ----------
patch("public/savings.js", "savings-debt", [
    [/    function render\(\) \{[\s\S]*?\n    \}\n\n    function stop/,
`    function render() {
        const el = ensureCard(); if (!el) return;
        const rows = ORDER.filter(k => docs[k] && typeof docs[k].balance === "number");
        const fz = docs.fuliza, owed = fz && typeof fz.balance === "number" && fz.balance > 0 ? fz : null;   // Fuliza is money you owe, so it is not part of the savings total
        el.hidden = !rows.length && !owed;
        if (!rows.length && !owed) return;
        const total = rows.reduce((s, k) => s + docs[k].balance, 0);
        const saved = rows.length ? \`<div class="savings-head"><h3>Savings</h3><strong>\${esc(money(total))}</strong></div>
            <div class="savings-rows">\${rows.map(k => { const d = docs[k];
                const move = d.lastAmount ? \`\${d.lastDir === "in" ? "Saved" : "Withdrew"} \${esc(money(d.lastAmount))}\${d.lastDate ? " · " + esc(day(d.lastDate)) : ""}\` : "";
                return \`<div class="savings-row"><div><span class="savings-name">\${esc(NAMES[k])}</span><small>\${move}</small></div><strong>\${esc(money(d.balance))}</strong></div>\`; }).join("")}</div>\` : "";
        const parts = [owed.due ? "Due " + day(owed.due) : "", typeof owed.limit === "number" ? money(owed.limit) + " still available" : ""].filter(Boolean);
        const debt = owed ? \`<div class="savings-debt"><div><span class="savings-name">Fuliza owed</span><small>\${esc(parts.join(" · "))}</small></div><strong>\${esc(money(owed.balance))}</strong></div>\` : "";
        el.innerHTML = saved + debt;
    }

    function stop`]
]);
patch("public/savings.css", "savings-debt", [[/$/, "\n/* savings-debt: Fuliza owed */\n.savings-debt { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0 0; margin-top: 4px; border-top: 1px solid var(--line); }\n.savings-debt:first-child { border-top: none; margin-top: 0; padding-top: 0; }\n.savings-debt > div { display: flex; flex-direction: column; min-width: 0; }\n.savings-debt small { font-size: 12px; color: var(--muted); }\n.savings-debt > strong { font-size: 16px; font-weight: 600; color: var(--expense, #e5484d); white-space: nowrap; }\n"]]);
patch("public/service-worker.js", "/* fuliza */", [[/const VERSION = "pesatrack-v(\d+)";/, (m, n) => `const VERSION = "pesatrack-v${+n + 1}"; /* fuliza */`]]);

// ---------- security rules ----------
patch("firestore.rules", "'fuliza'", [
    ["        && acct in ['mshwari', 'kcb']", "        && acct in ['mshwari', 'kcb', 'fuliza']"],
    ["hasOnly(['balance', 'asOf', 'lastAmount', 'lastDir', 'lastDate', 'updatedAt'])", "hasOnly(['balance', 'asOf', 'lastAmount', 'lastDir', 'lastDate', 'due', 'limit', 'updatedAt'])"],
    ["        && request.resource.data.updatedAt is string && request.resource.data.updatedAt.size() <= 40;",
     "        && request.resource.data.get('due', '') is string && request.resource.data.get('due', '').size() <= 10\n        && request.resource.data.get('limit', 0) is number && request.resource.data.get('limit', 0) < 1000000000000\n        && request.resource.data.updatedAt is string && request.resource.data.updatedAt.size() <= 40;"]
]);

// ---------- Android app ----------
patch(jv + "MpesaParser.java", "parseFuliza", [
    ["        String code, account, dir, date, asOf;   // account: \"mshwari\" | \"kcb\"; dir: \"in\" (into savings) | \"out\"\n        double amount, balance;",
     "        String code, account, dir, date, asOf;   // account: \"mshwari\" | \"kcb\" | \"fuliza\"; dir: \"in\" (into savings, or Fuliza repaid) | \"out\" (or Fuliza borrowed)\n        double amount, balance;   // for Fuliza, balance = what you still owe\n        String due;               // Fuliza only: due date, yyyy-MM-dd, or null\n        Double limit;             // Fuliza only: limit still available, or null\n        double fee;               // Fuliza only: access fee"],
    ["    static List<Transfer> parseTransfers(String text) {",
`    private static String pad2(int n) { return n < 10 ? "0" + n : String.valueOf(n); }

    // Fuliza (M-Pesa overdraft). Same rules as parseFuliza() in public/mpesa.js; these messages carry no date, so today's date is used.
    private static Transfer parseFuliza(String code, String body) {
        if (!find("fuliza", body) || find("(sent to|paid to|received)", body)) return null;
        java.util.Calendar now = java.util.Calendar.getInstance();
        Transfer t = new Transfer();
        t.code = code; t.account = "fuliza";
        t.date = now.get(java.util.Calendar.YEAR) + "-" + pad2(now.get(java.util.Calendar.MONTH) + 1) + "-" + pad2(now.get(java.util.Calendar.DAY_OF_MONTH));
        t.asOf = t.date + "T" + pad2(now.get(java.util.Calendar.HOUR_OF_DAY)) + ":" + pad2(now.get(java.util.Calendar.MINUTE));
        Matcher lim = match("Available Fuliza M-?PESA limit is\\\\s+" + AMOUNT, body);
        if (lim != null) t.limit = toNumber(lim.group(1));
        Matcher dm = match("due on\\\\s+" + DATE, body);
        if (dm != null) t.due = toISODate(dm.group(1), dm.group(2), dm.group(3));
        Matcher rp = match(AMOUNT + "\\\\s+from your M-?PESA has been used to\\\\s+(?:(fully|partially)\\\\s+)?pay your outstanding Fuliza", body);
        if (rp != null) {
            t.dir = "in"; t.amount = toNumber(rp.group(1));
            if (rp.group(2) != null && rp.group(2).equalsIgnoreCase("fully")) t.balance = 0;
            else {
                Matcher o = match("outstanding[^.]*?\\\\bis\\\\s+" + AMOUNT, body.substring(rp.end()));
                if (o == null) return null;
                t.balance = toNumber(o.group(1));
            }
            return t;
        }
        Matcher dr = match("Fuliza M-?PESA amount is\\\\s+" + AMOUNT, body);
        Matcher out = match("Total Fuliza M-?PESA outstanding amount is\\\\s+" + AMOUNT, body);
        if (dr == null || out == null) return null;
        t.dir = "out"; t.amount = toNumber(dr.group(1)); t.balance = toNumber(out.group(1));
        Matcher fm = match("Access Fee charged\\\\s+" + AMOUNT, body);
        t.fee = fm != null ? toNumber(fm.group(1)) : 0;
        return t;
    }

    static List<Transfer> parseTransfers(String text) {`],
    ["            Transfer t = parseTransfer(msg[0], msg[1]);\n            if (t != null",
     "            Transfer t = parseTransfer(msg[0], msg[1]);\n            if (t == null) t = parseFuliza(msg[0], msg[1]);\n            if (t != null"],
    ["            Item it = parseOne(msg[0], msg[1]);\n            if (it != null && seen.add(it.id)) items.add(it);",
`            Item it = parseOne(msg[0], msg[1]);
            if (it == null) {   // a Fuliza borrowing message: its access fee is a real expense
                Transfer f = parseFuliza(msg[0], msg[1]);
                if (f != null && f.fee > 0 && f.dir.equals("out")) {
                    it = new Item();
                    it.id = "mpesa-" + msg[0] + "-fzfee"; it.code = msg[0]; it.kind = "fuliza-fee"; it.type = "expense"; it.amount = f.fee; it.fee = 0;
                    it.date = f.date; it.description = "Fuliza access fee (" + msg[0] + ")"; it.category = "Fees & Charges";
                }
            }
            if (it != null && seen.add(it.id)) items.add(it);`]
]);
patch(jv + "Sender.java", "t.due", [
    [".put(\"updatedAt\", sv(f.format(new Date())));\n                JSONObject write = new JSONObject().put(\"update\"",
     ".put(\"updatedAt\", sv(f.format(new Date())));\n                if (t.due != null) fields.put(\"due\", sv(t.due));\n                if (t.limit != null) fields.put(\"limit\", new JSONObject().put(\"doubleValue\", t.limit.doubleValue()));\n                JSONObject write = new JSONObject().put(\"update\""],
    ["if ((code == 200 || code == -1) && firstTime(c, it.id)) Notifier.captured(c, it, code == -1);",
     "if (!\"fuliza-fee\".equals(it.kind) && (code == 200 || code == -1) && firstTime(c, it.id)) Notifier.captured(c, it, code == -1);   // a Fuliza fee gets the Fuliza notification instead"]
]);
patch(jv + "Notifier.java", "static void fuliza", [
    ["    static void savings(Context c, MpesaParser.Transfer t, boolean pending) {\n",
`    // Fuliza borrowed or repaid, and what is still owed
    static void fuliza(Context c, MpesaParser.Transfer t, boolean pending) {
        String due = "";
        try {
            if (t.due != null) due = " · due " + new java.text.SimpleDateFormat("d MMM", Locale.US).format(new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(t.due));
        } catch (Exception ignored) {}
        String owed = t.balance > 0 ? String.format(Locale.US, "You owe Ksh %,.2f", t.balance) + due : "Nothing owed";
        boolean borrowed = t.dir.equals("out");
        String text = (borrowed ? String.format(Locale.US, "Borrowed Ksh %,.2f", t.amount) + (t.fee > 0 ? String.format(Locale.US, " · fee Ksh %,.2f", t.fee) : "")
                : String.format(Locale.US, "Repaid Ksh %,.2f", t.amount)) + " · " + owed + (pending ? " · syncing when online" : "");
        show(c, ("fz" + t.code).hashCode(), borrowed ? "Fuliza borrowed" : "Fuliza repaid", text);
    }

    static void savings(Context c, MpesaParser.Transfer t, boolean pending) {
        if (t.account.equals("fuliza")) { fuliza(c, t, pending); return; }
`]
]);
patch("android/app/build.gradle.kts", 'versionName = "0.12.0"', [
    [/versionCode = (\d+)/, (m, n) => `versionCode = ${+n + 1}`], [/versionName = "[\d.]+"/, 'versionName = "0.12.0"']
]);
console.log(failed ? `\n${failed} problem(s), see above.` : "\nDone. Next: node tests/fuliza.test.mjs ; node tests/parity.mjs public/mpesa.js ; then deploy as described at the top.");
process.exit(failed ? 1 : 0);
