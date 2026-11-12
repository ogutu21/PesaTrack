// Payee memory: remembers which category you use for each person or till, so repeat payments sort themselves.
// Pure functions (no DOM, no Firebase). The Android app has a Java twin of payeeKey() in MpesaParser.java.

const PREFIX = /^(sent to|paid to|received from)\s+(.+)$/i;
export const MAX_PAYEES = 200;

// "Paid to NAIVAS KILIMANI" (expense) -> "out naivas kilimani". Money in and out of the same name are remembered separately.
// Returns "" when the description isn't a payment to or from a named party (airtime, withdrawals, fees, hand-typed entries).
export function payeeKey(description, type) {
    const m = String(description || "").match(PREFIX);
    if (!m) return "";
    const name = m[2].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40).trim();
    if (!name) return "";
    return (type === "income" ? "in " : "out ") + name;
}

// From your transactions, the category you most recently used for each payee. "Other" is not remembered, so the built-in guesses still apply.
export function learnPayees(transactions) {
    const best = new Map();   // key -> { category, stamp }
    for (const t of transactions || []) {
        if (!t || !t.category || t.category === "Other") continue;
        const key = payeeKey(t.description, t.type);
        if (!key) continue;
        const stamp = String(t.date || "") + "|" + String(t.createdAt || "");
        const cur = best.get(key);
        if (!cur || stamp >= cur.stamp) best.set(key, { category: String(t.category).slice(0, 60), stamp });
    }
    return Object.fromEntries([...best.entries()].sort((a, b) => b[1].stamp.localeCompare(a[1].stamp)).slice(0, MAX_PAYEES).map(([k, v]) => [k, v.category]));
}

export const sameMap = (a, b) => {
    const ka = Object.keys(a || {}), kb = Object.keys(b || {});
    return ka.length === kb.length && ka.every(k => (b || {})[k] === a[k]);
};
