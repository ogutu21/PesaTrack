// Run from the project root: node tests/payee.test.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url"; import { resolve } from "node:path";
const { payeeKey, learnPayees, sameMap } = await import(pathToFileURL(resolve("public/payee-core.js")).href);
const { processInbox } = await import(pathToFileURL(resolve("public/inbox-core.js")).href);

assert.equal(payeeKey("Paid to NAIVAS KILIMANI", "expense"), "out naivas kilimani");
assert.equal(payeeKey("Sent to John  Doe.", "expense"), "out john doe");
assert.equal(payeeKey("Received from JANE ROE", "income"), "in jane roe");
for (const d of ["Airtime purchase", "M-Pesa cash deposit", "M-Pesa withdrawal (Agent)", "M-Pesa fee (QKD7XYZ123)", "Lunch", "", null]) assert.equal(payeeKey(d, "expense"), "", String(d));
assert.equal(payeeKey("Paid to " + "A".repeat(80), "expense").length, 4 + 40);

const tx = (description, type, category, date, createdAt = "") => ({ description, type, category, date, createdAt });
const map = learnPayees([
    tx("Paid to NAIVAS", "expense", "Groceries", "2026-10-01"),
    tx("Paid to NAIVAS", "expense", "Shopping", "2026-11-01"),        // newest wins
    tx("Sent to MAMA", "expense", "Family Support", "2026-10-05"),
    tx("Sent to PETER", "expense", "Other", "2026-10-06"),            // "Other" is not remembered
    tx("Received from MAMA", "income", "Allowance", "2026-10-07"),    // money in is kept apart from money out
    tx("Lunch", "expense", "Food", "2026-10-08")                      // hand-typed, no payee
]);
assert.deepEqual(map, { "out naivas": "Shopping", "out mama": "Family Support", "in mama": "Allowance" });
assert.ok(sameMap(map, { ...map })); assert.ok(!sameMap(map, { ...map, "out naivas": "Food" }));
const many = Array.from({ length: 300 }, (_, i) => tx("Paid to SHOP " + i, "expense", "Shopping", "2026-10-" + String(1 + (i % 28)).padStart(2, "0"), String(i).padStart(4, "0")));
assert.equal(Object.keys(learnPayees(many)).length, 200);

// new M-Pesa messages reuse what you chose before
const sms = "QKD7XYZ123 Confirmed. Ksh500.00 paid to NAIVAS. on 7/11/26 at 10:32 AM. New M-PESA balance is Ksh1,200.50. Transaction cost, Ksh0.00.";
const run = async payees => { const saved = []; await processInbox([{ id: "a", text: sms }], { exists: async () => false, save: async t => { saved.push(t); }, remove: async () => {}, ...(payees ? { payees } : {}) }, "T"); return saved[0]; };
assert.equal((await run(async () => ({ "out naivas": "Shopping" }))).category, "Shopping");
assert.equal((await run(async () => ({ "out someone else": "Shopping" }))).category, "Groceries", "no memory for this payee: the built-in guess stays");
assert.equal((await run(null)).category, "Groceries", "older callers without payee memory still work");
assert.equal((await run(async () => { throw new Error("offline"); })).category, "Groceries", "memory unavailable: carry on");
console.log("payees: all checks passed");
