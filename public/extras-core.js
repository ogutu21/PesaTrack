// Review list, fee breakdown and "this month in words". Pure functions (no DOM, no Firebase) so they can be tested.
import { payeeKey } from "./payee-core.js";

const isMpesa = t => String(t && t.id || "").startsWith("mpesa-");
const feeKind = t => { const id = String(t && t.id || ""); return /^mpesa-.+-fzfee$/.test(id) ? "fuliza" : /^mpesa-.+-fee$/.test(id) ? "fee" : ""; };
const monthOf = d => String(d || "").slice(0, 7);
const nameOf = d => String(d || "").replace(/^(sent to|paid to|received from)\s+/i, "").trim();
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const newest = (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));

// ---------- tidy up older "Other" entries ----------
// M-Pesa transactions still filed under "Other" (not fees), newest first.
export function otherList(transactions) {
    return (transactions || []).filter(t => isMpesa(t) && !feeKind(t) && t.category === "Other").sort(newest);
}

// The M-Pesa group an older "Other" transaction belongs to, from its description. null = leave it as it is.
export function regroupCategory(t) {
    const d = String(t && t.description || ""), type = t && t.type;
    if (/^m-pesa withdrawal/i.test(d)) return "Withdrawals";
    if (type === "income") return /^(received from|m-pesa cash deposit)/i.test(d) ? "Money Received" : null;
    if (/^sent to .*\bfor account\b/i.test(d)) return "Pay Bill";
    if (/^paid to /i.test(d)) return "Buy Goods";
    if (/^sent to /i.test(d)) return "Send Money";
    return null;
}

// ---------- money out, by person or till ----------
// One row per name you sent to or paid, biggest first. month = "YYYY-MM" or null for everything.
export function peopleOut(transactions, month) {
    const by = new Map();
    for (const t of transactions || []) {
        if (!t || t.type !== "expense" || (month && monthOf(t.date) !== month)) continue;
        const key = payeeKey(t.description, "expense"); if (!key) continue;
        const row = by.get(key) || { key, name: nameOf(t.description), total: 0, count: 0 };
        row.total += Number(t.amount) || 0; row.count++; by.set(key, row);
    }
    return [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// ---------- fees ----------
// What M-Pesa charges cost in a month (month = "YYYY-MM", or null for everything), and where they came from.
export function feeBreakdown(transactions, month) {
    const list = transactions || [], byId = new Map(list.map(t => [t.id, t]));
    const labels = { send: "Sending money", withdraw: "Withdrawals", pay: "Paying shops and bills", fuliza: "Fuliza access fees", other: "Other" };
    const groups = {};
    let total = 0, count = 0, spent = 0;
    for (const t of list) {
        if (t.type !== "expense" || (month && monthOf(t.date) !== month)) continue;
        spent += Number(t.amount) || 0;
        const kind = feeKind(t);
        if (!kind) continue;
        let g = "other";
        if (kind === "fuliza") g = "fuliza";
        else {
            const base = byId.get(String(t.id).replace(/-fee$/, ""));
            const d = base ? String(base.description || "") : "";
            g = /^sent to/i.test(d) ? "send" : /withdraw/i.test(d) ? "withdraw" : /^paid to/i.test(d) ? "pay" : "other";
        }
        const amt = Number(t.amount) || 0;
        (groups[g] ||= { key: g, label: labels[g], total: 0, count: 0 });
        groups[g].total += amt; groups[g].count++; total += amt; count++;
    }
    return { total: Math.round(total * 100) / 100, count, share: spent > 0 ? total / spent : 0, groups: Object.values(groups).sort((a, b) => b.total - a.total) };
}

// ---------- this month in words ----------
// Spending by category for a month; with dayLimit, only up to that day of the month (a fair comparison with a month still in progress).
export function spendByCategory(transactions, month, dayLimit = 31) {
    const out = {};
    for (const t of transactions || []) {
        if (t.type !== "expense" || monthOf(t.date) !== month) continue;
        if (Number(String(t.date).slice(8, 10)) > dayLimit) continue;
        out[t.category || "Other"] = (out[t.category || "Other"] || 0) + (Number(t.amount) || 0);
    }
    return out;
}

// Up to two short sentences. `today` is "YYYY-MM-DD"; `prev` is the month before `month`; fmt formats money.
export function sentences(transactions, { month, prev, prevName, today, fmt }) {
    const out = [];
    const day = month === monthOf(today) ? Number(today.slice(8, 10)) : 31;
    const cur = spendByCategory(transactions, month, day), old = spendByCategory(transactions, prev, day);
    const moves = Object.keys(cur).filter(k => old[k] > 0 && k !== "Other").map(k => ({ k, diff: cur[k] - old[k], pct: Math.round((cur[k] - old[k]) / old[k] * 100) }))
        .filter(m => Math.abs(m.diff) >= 500 && Math.abs(m.pct) >= 25).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (moves[0]) {
        const m = moves[0];
        out.push(`${m.k} is ${m.diff > 0 ? "up" : "down"} ${Math.abs(m.pct)}%: ${fmt(Math.abs(m.diff))} ${m.diff > 0 ? "more" : "less"} than by this day in ${prevName}.`);
    }
    // a payment far above what you usually pay the same person or shop
    const expenses = (transactions || []).filter(t => t.type === "expense" && !feeKind(t));
    const flagged = [];
    for (const t of expenses.filter(t => monthOf(t.date) === month)) {
        const key = payeeKey(t.description, "expense"); if (!key) continue;
        const before = expenses.filter(o => o !== t && payeeKey(o.description, "expense") === key && String(o.date) < String(t.date)).map(o => Number(o.amount));
        if (before.length < 3) continue;
        const usual = median(before);
        if (usual > 0 && t.amount >= usual * 3 && t.amount - usual >= 1000) flagged.push({ t, usual, score: t.amount - usual });
    }
    flagged.sort((a, b) => b.score - a.score);
    if (flagged[0]) { const { t, usual } = flagged[0]; out.push(`${fmt(t.amount)} to ${nameOf(t.description)} is about ${Math.round(t.amount / usual)}× what you usually pay them (${fmt(usual)}).`); }
    return out;
}
