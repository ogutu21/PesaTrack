// M-Pesa statement (PDF) parser: turns the text of a Safaricom statement into transactions.
// Pure functions only (no DOM, no Firebase, no PDF library), so it is easy to test.
//
// Input is what a PDF text layer gives us: for every page, a list of { str, x, y, w }
// (text, left edge, baseline height measured from the bottom of the page, and width).
import { guessCategory } from "./mpesa.js";

const RECEIPT = /^[A-Z0-9]{10}$/;
const TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
const NUM = /^-?\d[\d,]*\.\d{2}$/;
const toNumber = s => Number(String(s).replace(/,/g, ""));
const round2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- 1. rows
// Rebuilds the table: one object per receipt row, with wrapped "Details" lines joined.
export function rowsFromPages(pages) {
    const rows = [];
    pages.forEach((items, pageIndex) => {
        const list = items.filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);

        // Column centres come from the header row, so a slightly different layout still works.
        const head = name => list.find(i => i.str.trim() === name);
        const hp = head("Paid In"), hw = head("Withdrawn"), hb = head("Balance");
        const centres = hp && hw && hb
            ? { paid: hp.x + hp.w / 2, out: hw.x + hw.w / 2, bal: hb.x + hb.w / 2 }
            : { paid: 385, out: 454, bal: 524 };
        const nearest = c => Object.entries(centres).sort((a, b) => Math.abs(a[1] - c) - Math.abs(b[1] - c))[0][0];

        let cur = null;
        for (const it of list) {
            const s = it.str.trim();
            if (/^Disclaimer:/i.test(s)) break;                       // footer: nothing after this is a row
            if (RECEIPT.test(s) && it.x < 100) {
                cur = { receipt: s, page: pageIndex + 1, time: "", detailParts: [], status: "", paid: null, out: null, balance: null };
                rows.push(cur);
                continue;
            }
            if (!cur) continue;
            if (TIME.test(s)) { cur.time = s; continue; }
            if (NUM.test(s) && it.x > 330) {
                const col = nearest(it.x + it.w / 2);
                if (col === "paid") cur.paid = toNumber(s);
                else if (col === "out") cur.out = toNumber(s);
                else cur.balance = toNumber(s);
                continue;
            }
            if (it.x >= 270 && it.x < 330) { cur.status += (cur.status ? " " : "") + s; continue; }
            if (it.x >= 170 && it.x < 270) cur.detailParts.push(s);
        }
    });
    return rows.map(r => ({
        receipt: r.receipt, page: r.page,
        date: (r.time.match(TIME) || [])[1] || "", time: (r.time.match(TIME) || [])[2] || "",
        details: r.detailParts.join(" ").replace(/\s+/g, " ").trim(),
        status: r.status.trim(),
        // statement convention: money out is printed as a negative number
        amount: r.paid != null ? r.paid : r.out != null ? Math.abs(r.out) : null,
        direction: r.paid != null ? "in" : r.out != null ? "out" : null,
        balance: r.balance
    }));
}

// The SUMMARY table on page 1 ends with "TOTAL: <paid in> <paid out>".
export function summaryFromPages(pages) {
    const items = (pages[0] || []).filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const idx = items.findIndex(i => /^TOTAL:?$/i.test(i.str.trim()));
    if (idx < 0) return null;
    const y = items[idx].y;
    const nums = items.filter(i => Math.abs(i.y - y) < 2 && NUM.test(i.str.trim())).sort((a, b) => a.x - b.x).map(i => toNumber(i.str.trim()));
    if (nums.length < 2) return null;
    const meta = {};
    const find = label => { const i = items.findIndex(t => t.str.trim().startsWith(label)); return i < 0 ? "" : items.filter(t => Math.abs(t.y - items[i].y) < 2 && t.x > items[i].x + 60).map(t => t.str.trim()).join(" "); };
    meta.period = find("Statement Period");
    return { paidIn: nums[0], paidOut: nums[1], period: meta.period };
}

// ------------------------------------------------------- 2. classification
const isFee = d => /\bcharge$/i.test(d) || /\bcharge\b/i.test(d) && !/ to | from | at /i.test(d);
const INTERNAL = /^(M-Shwari|KCB M-PESA)\b/i;

// "Customer Transfer to - 0705***626 JOHN DOE" -> "JOHN DOE"; "Pay Bill to 247247 - ACME LTD Acc. 123" -> "ACME LTD"
export function partyFrom(details) {
    let s = details.includes(" - ") ? details.slice(details.indexOf(" - ") + 3) : "";
    s = s.replace(/^\S*\*+\S*\s+/, "")                 // masked phone
        .replace(/^\d{9,12}\s+/, "")                     // plain phone
        .replace(/\s+(Acc|A\/C)\b.*$/i, "")              // account reference
        .replace(/\s*(via API|Original conversation).*$/i, "")  // API boilerplate
        .replace(/\s+\S+@\S+.*$/, "")                    // e-mail reference
        .replace(/\s+\d{9,}\s*$/, "")                    // trailing number
        .replace(/[.\s]+$/, "").replace(/\s{2,}/g, " ").trim();
    return s.slice(0, 60);
}

function classify(r) {
    const d = r.details;
    const out = { type: r.direction === "in" ? "income" : "expense" };
    let party = partyFrom(d);

    if (INTERNAL.test(d)) return { ...out, kind: "transfer", internal: true, party: d.replace(/\s+/g, " "), description: `${d} (own account)`, category: "Other" };
    if (/reversal/i.test(d)) return { ...out, type: "income", kind: "reversal", party, description: `Reversal${party ? ` (${party})` : ""}`, category: "Refunds" };
    if (/^Funds received from/i.test(d) || /^Business Payment from/i.test(d) || /Payment to Customer via API from/i.test(d) || /^Offnet B2C Transfer/i.test(d)) {
        if (/airtel money/i.test(d) && !party) party = "Airtel Money";
        return { ...out, kind: "received", party, description: `Received from ${party || "M-Pesa"}`, category: guessCategory(party, "income") };
    }
    if (/^Deposit of Funds at Agent/i.test(d)) return { ...out, kind: "deposit", party, description: "M-Pesa cash deposit", category: "Other" };
    if (/^Customer Withdrawal At Agent/i.test(d)) return { ...out, kind: "withdraw", party, description: `M-Pesa withdrawal${party ? ` (${party})` : ""}`, category: "Other" };
    if (/^Airtime Purchase/i.test(d)) return { ...out, kind: "airtime", party: "Airtime", description: "Airtime purchase", category: "Airtime & Data" };
    if (/^Customer Bundle Purchase/i.test(d)) return { ...out, kind: "airtime", party: "Data bundles", description: "Data bundles", category: "Airtime & Data" };
    if (/^Customer Transfer to|^Customer Payment to Small Business/i.test(d)) return { ...out, kind: "sent", party, description: `Sent to ${party}`, category: guessCategory(party, "expense") };
    if (/^Merchant Payment/i.test(d)) return { ...out, kind: "paid", party, description: `Paid to ${party}`, category: guessCategory(party, "expense") };
    if (/^(Card )?Pay Bill|^Offnet C2B Transfer/i.test(d)) {
        const category = /airtel money/i.test(party) ? "Other" : guessCategory(party, "expense");
        return { ...out, kind: "paybill", party, description: `Paid to ${party}`, category };
    }
    return { ...out, kind: out.type === "income" ? "received" : "paid", party, description: (out.type === "income" ? "Received: " : "Paid: ") + d.slice(0, 80), category: out.type === "income" ? "Other" : "Other" };
}

// ------------------------------------------------------------- 3. the whole statement
// Returns { items, skipped, summary, check }
//  items: same shape as the SMS importer ({ id, code, kind, type, amount, fee, date, description, category })
//         plus { party, group, internal, time }. Money moved between your own accounts (M-Shwari, KCB
//         M-PESA) has internal: true so the screen can leave it out by default.
export function parseStatement(pages) {
    const rows = rowsFromPages(pages);
    const summary = summaryFromPages(pages);
    const skipped = [];
    const fees = new Map(), mains = [];
    let inTotal = 0, outTotal = 0;

    for (const r of rows) {
        if (r.amount == null || !r.date) { skipped.push({ reason: "Unreadable row", text: r.receipt }); continue; }
        if (r.direction === "in") inTotal += r.amount; else outTotal += r.amount;
        if (!/^Completed/i.test(r.status)) { skipped.push({ reason: `Status: ${r.status || "unknown"}`, text: r.receipt }); continue; }
        if (r.direction === "out" && isFee(r.details)) fees.set(r.receipt, round2((fees.get(r.receipt) || 0) + r.amount));
        else mains.push(r);
    }

    const items = [], seen = new Set();
    const usedFee = new Set();
    for (const r of mains) {
        const c = classify(r);
        const id = `mpesa-${r.receipt}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const fee = fees.get(r.receipt) || 0;
        if (fee) usedFee.add(r.receipt);
        const base = { id, code: r.receipt, kind: c.kind, type: c.type, amount: r.amount, fee: c.internal ? 0 : fee, date: r.date, time: r.time,
            description: c.description.slice(0, 100), category: c.category, party: c.party, internal: !!c.internal,
            group: `${c.type}|${c.kind}|${(c.party || "").toLowerCase()}` };
        items.push(base);
        if (c.internal && fee) items.push(feeItem(r, fee));
    }
    // fee rows with no main row on the statement
    for (const r of rows) {
        if (r.direction === "out" && r.amount != null && r.date && /^Completed/i.test(r.status) && isFee(r.details) && !usedFee.has(r.receipt) && !seen.has(`mpesa-${r.receipt}-fee`)) {
            if (items.some(i => i.code === r.receipt && i.internal)) continue;
            items.push(feeItem(r, fees.get(r.receipt)));
            seen.add(`mpesa-${r.receipt}-fee`); usedFee.add(r.receipt);
        }
    }
    items.sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));

    const check = summary ? {
        paidIn: round2(inTotal), paidOut: round2(outTotal),
        expectedIn: summary.paidIn, expectedOut: summary.paidOut,
        ok: Math.abs(inTotal - summary.paidIn) < 0.01 && Math.abs(outTotal - summary.paidOut) < 0.01
    } : { paidIn: round2(inTotal), paidOut: round2(outTotal), ok: null };

    return { items, skipped, summary, check, rowCount: rows.length };
}

function feeItem(r, amount) {
    return { id: `mpesa-${r.receipt}-fee`, code: r.receipt, kind: "fee", type: "expense", amount, fee: 0, date: r.date, time: r.time,
        description: `M-Pesa fee (${r.receipt})`, category: "Fees & Charges", party: "", internal: false, group: "expense|fee|" };
}
