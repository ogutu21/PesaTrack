// Run: node test/statement.test.mjs   (from the project root)
import assert from "node:assert/strict";
import { parseStatement, partyFrom } from "../public/statement.js";

// Build a tiny fake statement page: [receipt, time, details, status, paid, out, balance]
const col = { rec: 38, time: 107.7, det: 177.5, st: 282, paid: 380, out: 450, bal: 520 };
function page(rows, totals) {
    const it = (str, x, y, w = 40) => ({ str, x, y, w });
    const out = [it("TOTAL:", 40, 700), it(String(totals[0]), 380, 700), it(String(totals[1]), 450, 700),
        it("Paid In", 360, 650, 40), it("Withdrawn", 430, 650, 40), it("Balance", 505, 650, 30)];
    rows.forEach((r, i) => {
        const y = 600 - i * 20;
        out.push(it(r[0], col.rec, y), it(r[1], col.time, y), ...r[2].split("|").map((p, k) => it(p, col.det, y - k * 8)), it(r[3], col.st, y));
        if (r[4]) out.push(it(r[4], col.paid, y)); if (r[5]) out.push(it(r[5], col.out, y)); out.push(it(r[6], col.bal, y));
    });
    return out;
}
const rows = [
    ["AAAAAAAAA1", "2026-01-02 10:00:00", "Customer Transfer to - 0712***345|JOHN DOE", "Completed", "", "-500.00", "9,500.00"],
    ["AAAAAAAAA1", "2026-01-02 10:00:00", "Customer Transfer of Funds Charge", "Completed", "", "-7.00", "9,493.00"],
    ["BBBBBBBBB2", "2026-01-03 09:00:00", "Funds received from - 0722***111 JANE ROE", "Completed", "1,000.00", "", "10,493.00"],
    ["CCCCCCCCC3", "2026-01-04 09:00:00", "M-Shwari Deposit", "Completed", "", "-200.00", "10,293.00"],
    ["DDDDDDDDD4", "2026-01-05 09:00:00", "Merchant Payment to 123 - NAIVAS SUPERMARKET", "Completed", "", "-300.00", "9,993.00"],
];
const r = parseStatement([page(rows, ["1,000.00", "1,007.00"])]);
assert.equal(r.rowCount, 5);
assert.equal(r.check.ok, true);
const by = id => r.items.find(i => i.id === id);
assert.equal(by("mpesa-AAAAAAAAA1").fee, 7);          // fee row joins its transaction
assert.equal(by("mpesa-AAAAAAAAA1").description, "Sent to JOHN DOE");
assert.equal(by("mpesa-BBBBBBBBB2").type, "income");
assert.equal(by("mpesa-CCCCCCCCC3").internal, true);  // own-account transfer
assert.equal(by("mpesa-DDDDDDDDD4").category, "Groceries");
assert.equal(partyFrom("Funds received from - 254713***496 A B"), "A B");
assert.equal(partyFrom("Pay Bill to 247247 - ACME LTD Acc. 0110335864"), "ACME LTD");
console.log("statement parser: all checks passed");
