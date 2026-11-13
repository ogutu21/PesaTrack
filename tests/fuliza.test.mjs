// Run from the project root: node tests/fuliza.test.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url"; import { resolve } from "node:path";
const { parseMpesa } = await import(pathToFileURL(resolve("public/mpesa.js")).href);
const { processInbox } = await import(pathToFileURL(resolve("public/inbox-core.js")).href);
const today = (() => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

const draw = "[13/11, 11:04] Purity: UK76V10CK7 Confirmed. Fuliza M-PESA amount is Ksh 40.00. Access Fee charged Ksh 0.40. Total Fuliza M-PESA outstanding amount is Ksh423.12 due on 05/12/26. To check daily charges, Dial *334#OK Select Query Charges";
const repay = "[13/11, 11:08] Purity: UK86V13RZD\n Confirmed. Ksh 393.72 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 600.00. Your M-PESA balance is 6016.28.";

let r = parseMpesa(draw);
assert.equal(r.transfers.length, 1);
const t = r.transfers[0];
assert.deepEqual({ ...t, asOf: t.asOf.slice(0, 10) }, { code: "UK76V10CK7", account: "fuliza", dir: "out", amount: 40, balance: 423.12, date: today, asOf: today, due: "2026-12-05", limit: null, fee: 0.4 });
assert.equal(r.items.length, 1, "the access fee is an expense");
assert.deepEqual(r.items[0], { id: "mpesa-UK76V10CK7-fzfee", code: "UK76V10CK7", kind: "fuliza-fee", type: "expense", amount: 0.4, fee: 0, date: today, description: "Fuliza access fee (UK76V10CK7)", category: "Fees & Charges" });
assert.ok(/not counted as spending/.test(r.skipped[0].reason) && /Fuliza/.test(r.skipped[0].reason));

r = parseMpesa(repay);
assert.equal(r.items.length, 0, "repaying is not spending");
assert.equal(r.transfers.length, 1);
assert.deepEqual({ ...r.transfers[0], asOf: "" }, { code: "UK86V13RZD", account: "fuliza", dir: "in", amount: 393.72, balance: 0, date: today, asOf: "", due: null, limit: 600, fee: 0 });

// partial repayment: the message says what is still owed
r = parseMpesa("UK86V13AAA Confirmed. Ksh 100.00 from your M-PESA has been used to partially pay your outstanding Fuliza M-PESA. Outstanding Fuliza M-PESA amount is Ksh 293.72 due on 05/12/26. Available Fuliza M-PESA limit is Ksh 306.28.");
assert.equal(r.transfers[0].balance, 293.72); assert.equal(r.transfers[0].due, "2026-12-05"); assert.equal(r.transfers[0].limit, 306.28);
// partial repayment we can't read: skipped, never guessed
r = parseMpesa("UK86V13BBB Confirmed. Ksh 100.00 from your M-PESA has been used to partially pay your outstanding Fuliza M-PESA.");
assert.equal(r.transfers.length, 0); assert.equal(r.items.length, 0);
// a purchase that mentions Fuliza keeps being an ordinary purchase
r = parseMpesa("UK70AAAAAA Confirmed. Ksh70.00 paid to JAVA HOUSE. on 3/3/27 at 1:00 PM. Transaction cost, Ksh0.00. Fuliza M-PESA amount is Ksh 70.00.");
assert.equal(r.transfers.length, 0); assert.equal(r.items.length, 1); assert.equal(r.items[0].description, "Paid to JAVA HOUSE");
// other Fuliza notices stay ignored
assert.equal(parseMpesa("UK70BBBBBB Confirmed. Your Fuliza M-PESA limit has been reviewed.").transfers.length, 0);
// two messages together
r = parseMpesa(draw + "\n" + repay); assert.equal(r.transfers.length, 2); assert.equal(r.items.length, 1);

// through the inbox: balance saved, fee saved once, message cleared
const saved = [], tr = [], removed = [];
const deps = { exists: async id => saved.some(s => s.id === id), save: async x => { saved.push(x); }, saveTransfer: async x => { tr.push(x); }, remove: async id => { removed.push(id); } };
const out = await processInbox([{ id: "a", text: draw }, { id: "b", text: repay }], deps, "T");
assert.deepEqual(out, { added: 1, duplicates: 0, unreadable: 0, failed: 0, transfers: 2 });
assert.deepEqual(saved.map(s => [s.id, s.amount, s.category]), [["mpesa-UK76V10CK7-fzfee", 0.4, "Fees & Charges"]]);
assert.deepEqual(tr.map(x => [x.account, x.dir, x.balance]), [["fuliza", "out", 423.12], ["fuliza", "in", 0]]);
assert.deepEqual(removed, ["a", "b"]);
console.log("fuliza: all checks passed");
