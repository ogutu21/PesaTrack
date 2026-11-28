// Run from the project root: node tests/extras.test.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url"; import { resolve } from "node:path";
const { otherList, regroupCategory, peopleOut, feeBreakdown, spendByCategory, sentences } = await import(pathToFileURL(resolve("public/extras-core.js")).href);
const tx = (id, description, type, category, date, amount, createdAt = "") => ({ id, description, type, category, date, amount, createdAt });
const fmt = n => "Ksh " + Math.round(n).toLocaleString("en-US");

// review list
const list = [
    tx("mpesa-A1", "Paid to NEW SHOP", "expense", "Other", "2026-11-05", 300),
    tx("mpesa-A2", "M-Pesa withdrawal (Agent)", "expense", "Other", "2026-11-07", 1000),
    tx("mpesa-A2-fee", "M-Pesa fee (A2)", "expense", "Other", "2026-11-07", 28),          // fees are never asked about
    tx("mpesa-A3", "Paid to NAIVAS", "expense", "Groceries", "2026-11-06", 900),
    tx("manual-1", "Lunch", "expense", "Other", "2026-11-06", 200),                         // typed by hand: not asked about
    tx("mpesa-A4", "Received from JANE", "income", "Other", "2026-11-08", 500)
];
assert.deepEqual(otherList(list).map(t => t.id), ["mpesa-A4", "mpesa-A2", "mpesa-A1"]);
assert.equal(regroupCategory(list[0]), "Buy Goods");
assert.equal(regroupCategory(list[1]), "Withdrawals");
assert.equal(regroupCategory(list[5]), "Money Received");
assert.equal(regroupCategory(tx("mpesa-B", "Sent to KPLC PREPAID for account 123", "expense", "Other", "", 1)), "Pay Bill");
assert.equal(regroupCategory(tx("mpesa-B", "Sent to JOHN DOE", "expense", "Other", "", 1)), "Send Money");
assert.equal(regroupCategory(tx("mpesa-B", "Airtime purchase", "expense", "Other", "", 1)), null);
assert.equal(regroupCategory(tx("mpesa-B", "Fuliza access fee (X)", "expense", "Other", "", 1)), null);

// money out by person (the same name always lands in the same row)
const ppl = peopleOut([
    tx("1", "Sent to MCVAY OGUTU", "expense", "Send Money", "2026-11-02", 500),
    tx("2", "Sent to MCVAY OGUTU", "expense", "Send Money", "2026-11-09", 300),
    tx("3", "Sent to  mcvay  ogutu", "expense", "Send Money", "2026-10-09", 100),
    tx("4", "Paid to NAIVAS", "expense", "Groceries", "2026-11-03", 900),
    tx("5", "Received from JANE", "income", "Money Received", "2026-11-04", 5000),
    tx("6", "Airtime purchase", "expense", "Airtime & Data", "2026-11-05", 50)
], "2026-11");
assert.deepEqual(ppl.map(p => [p.name, p.total, p.count]), [["NAIVAS", 900, 1], ["MCVAY OGUTU", 800, 2]]);
assert.deepEqual(peopleOut([tx("3", "Sent to  mcvay  ogutu", "expense", "x", "2026-10-09", 100), tx("1", "Sent to MCVAY OGUTU", "expense", "x", "2026-11-02", 500)], null).map(p => p.total), [600]);

// fees
const f = [
    tx("mpesa-S1", "Sent to JOHN", "expense", "Family", "2026-11-02", 5000), tx("mpesa-S1-fee", "M-Pesa fee (S1)", "expense", "Fees & Charges", "2026-11-02", 28),
    tx("mpesa-W1", "M-Pesa withdrawal (Agent)", "expense", "Other", "2026-11-03", 2000), tx("mpesa-W1-fee", "M-Pesa fee (W1)", "expense", "Fees & Charges", "2026-11-03", 32),
    tx("mpesa-P1", "Paid to JAVA", "expense", "Food", "2026-11-04", 800), tx("mpesa-P1-fee", "M-Pesa fee (P1)", "expense", "Fees & Charges", "2026-11-04", 5),
    tx("mpesa-F1-fzfee", "Fuliza access fee (F1)", "expense", "Fees & Charges", "2026-11-05", 0.4),
    tx("mpesa-OLD", "Sent to X", "expense", "Other", "2026-10-02", 100), tx("mpesa-OLD-fee", "M-Pesa fee (OLD)", "expense", "Fees & Charges", "2026-10-02", 7)
];
const fb = feeBreakdown(f, "2026-11");
assert.equal(fb.total, 65.4); assert.equal(fb.count, 4);
assert.deepEqual(fb.groups.map(g => [g.key, g.total]), [["withdraw", 32], ["send", 28], ["pay", 5], ["fuliza", 0.4]]);
assert.ok(fb.share > 0.007 && fb.share < 0.009);
assert.equal(feeBreakdown(f, null).total, 72.4); assert.equal(feeBreakdown([], "2026-11").total, 0);

// words
const base = [];
for (let i = 0; i < 2; i++) base.push(tx("o" + i, "Paid to NAIVAS", "expense", "Groceries", `2026-10-0${i + 1}`, 1000));
base.push(tx("o9", "Paid to JAVA", "expense", "Food", "2026-10-03", 1000), tx("o10", "Paid to JAVA", "expense", "Food", "2026-10-25", 5000));   // after day 10: must not count against early November
base.push(tx("n1", "Paid to JAVA", "expense", "Food", "2026-11-04", 3500), tx("n2", "Paid to NAIVAS", "expense", "Groceries", "2026-11-06", 1100));
const words = sentences(base, { month: "2026-11", prev: "2026-10", prevName: "October", today: "2026-11-10", fmt });
assert.equal(words.length, 1, JSON.stringify(words)); assert.match(words[0], /^Food is up 250%: Ksh 2,500 more than by this day in October\.$/);
const odd = [...base, ...[1, 2, 3].map(i => tx("h" + i, "Paid to KIOSK", "expense", "Shopping", `2026-09-0${i}`, 400)), tx("big", "Paid to KIOSK", "expense", "Shopping", "2026-11-08", 4000)];
const w2 = sentences(odd, { month: "2026-11", prev: "2026-10", prevName: "October", today: "2026-11-10", fmt });
assert.ok(w2.some(s => /Ksh 4,000 to KIOSK is about 10× what you usually pay them \(Ksh 400\)\./.test(s)), JSON.stringify(w2));
assert.deepEqual(sentences([], { month: "2026-11", prev: "2026-10", prevName: "October", today: "2026-11-10", fmt }), []);
console.log("extras: all checks passed");
