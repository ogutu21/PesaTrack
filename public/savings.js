// "Savings" card on the home screen: balances held in M-Shwari and KCB M-PESA, from your M-Pesa messages.
import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const NAMES = { mshwari: "M-Shwari", kcb: "KCB M-PESA" };
const ORDER = ["mshwari", "kcb"];

export function initSavings({ $, escapeHTML: esc, formatCurrency: money }) {
    let unsub = null, card = null, docs = {};

    function ensureCard() {
        if (card && card.isConnected) return card;
        const anchor = $("quickActions") || document.querySelector("#dashboard .dashboard-grid");
        if (!anchor) return null;
        card = document.createElement("section");
        card.className = "savings"; card.id = "savingsCard"; card.hidden = true;
        anchor.after(card);
        return card;
    }

    const day = iso => { const d = new Date(String(iso || "") + "T00:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }); };

    function render() {
        const el = ensureCard(); if (!el) return;
        const rows = ORDER.filter(k => docs[k] && typeof docs[k].balance === "number");
        el.hidden = !rows.length;
        if (!rows.length) return;
        const total = rows.reduce((s, k) => s + docs[k].balance, 0);
        el.innerHTML = `<div class="savings-head"><h3>Savings</h3><strong>${esc(money(total))}</strong></div>
            <div class="savings-rows">${rows.map(k => { const d = docs[k];
                const move = d.lastAmount ? `${d.lastDir === "in" ? "Saved" : "Withdrew"} ${esc(money(d.lastAmount))}${d.lastDate ? " · " + esc(day(d.lastDate)) : ""}` : "";
                return `<div class="savings-row"><div><span class="savings-name">${esc(NAMES[k])}</span><small>${move}</small></div><strong>${esc(money(d.balance))}</strong></div>`; }).join("")}</div>`;
    }

    function stop() { if (unsub) unsub(); unsub = null; docs = {}; if (card) { card.hidden = true; } }

    return {
        onUser(user) {
            stop();
            if (!user) return;
            unsub = onSnapshot(collection(db, "users", user.uid, "savings"),
                snap => { docs = {}; snap.docs.forEach(d => { docs[d.id] = d.data(); }); render(); },
                e => console.warn("Savings:", e));
        }
    };
}
