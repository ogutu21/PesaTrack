// Keeps your payee memory (users/{uid}/settings/payees) up to date from your own transactions.
// New M-Pesa messages then reuse the category you chose last time for the same person or till.
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { learnPayees, sameMap } from "./payee-core.js";

export function initPayees() {
    let uid = null, stored = null, timer = null, latest = null;

    const ref = () => doc(db, "users", uid, "settings", "payees");

    async function flush() {
        timer = null;
        if (!uid || !latest) return;
        const map = latest;
        try {
            if (stored === null) { const s = await getDoc(ref()); stored = s.exists() ? (s.data().map || {}) : {}; }
            if (sameMap(map, stored)) return;
            await setDoc(ref(), { map, updatedAt: new Date().toISOString() });
            stored = map;
        } catch (e) { console.warn("Payees:", e); }
    }

    return {
        onUser(user) { uid = user ? user.uid : null; stored = null; latest = null; if (timer) clearTimeout(timer); timer = null; },
        // call with your personal transactions whenever they change
        onTransactions(list) {
            if (!uid) return;
            latest = learnPayees(list);
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, 3000);
        }
    };
}
