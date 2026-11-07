import assert from "node:assert/strict";
import { processInbox, addedMessage } from "/tmp/claude-0/-home-claude/6244b1b5-6fd0-5fb2-b055-f72b0efc5d39/scratchpad/itest/public/inbox-core.js";
const sms = "QKD7XYZ123 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 7/11/26 at 10:32 AM. New M-PESA balance is Ksh1,200.50. Transaction cost, Ksh7.00.";
const got = "QKD7ABC999 Confirmed.You have received Ksh2,000.00 from JANE ROE 0722111222 on 7/11/26 at 11:02 AM  New M-PESA balance is Ksh3,200.50.";
const mk = (existing = []) => { const saved = [], removed = []; return { saved, removed, deps: { exists: async id => existing.includes(id), save: async t => { saved.push(t); }, remove: async id => { removed.push(id); } } }; };
let m = mk(); let r = await processInbox([{ id: "a", text: sms }, { id: "b", text: got }, { id: "c", text: "Hello from a friend" }, { id: "d", text: "QKD7ZZZ111 Confirmed. Fuliza M-PESA amount is Ksh100.00" }], m.deps, "T");
console.log(JSON.stringify(r), m.saved.map(t => t.id).join(","));
assert.deepEqual(r, { added: 2, duplicates: 0, unreadable: 2, failed: 0 });
assert.deepEqual(m.saved.map(t => t.id), ["mpesa-QKD7XYZ123", "mpesa-QKD7XYZ123-fee", "mpesa-QKD7ABC999"]);
assert.equal(m.saved[0].category, "Other"); assert.equal(m.saved[0].date, "2026-11-07"); assert.equal(m.saved[1].amount, 7);
assert.deepEqual(m.removed.sort(), ["a", "b", "c", "d"]);
// the same message twice (re-delivered): not added again, inbox still tidied
m = mk(["mpesa-QKD7XYZ123"]); r = await processInbox([{ id: "a", text: sms }], m.deps);
assert.deepEqual(r, { added: 0, duplicates: 1, unreadable: 0, failed: 0 }); assert.equal(m.saved.length, 0); assert.deepEqual(m.removed, ["a"]);
// a save that fails keeps the message for next time
m = mk(); m.deps.save = async () => { throw new Error("offline"); }; r = await processInbox([{ id: "a", text: sms }], m.deps);
assert.equal(r.failed, 1); assert.deepEqual(m.removed, []);
assert.equal(addedMessage({ added: 1 }), "1 M-Pesa transaction added automatically");
console.log("inbox-core: all checks passed");
