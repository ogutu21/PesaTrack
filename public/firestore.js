// PesaTrack data layer: all Firestore access lives here.
import { db } from "./firebase-config.js";
import {
    doc, setDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const txCollection = uid => collection(db, "users", uid, "transactions");

function clean(tx) {
    return {
        id: String(tx.id),
        description: String(tx.description || "").slice(0, 200),
        amount: Math.round((Number(tx.amount) || 0) * 100) / 100,
        type: tx.type === "income" ? "income" : "expense",
        category: tx.category || "Other",
        date: tx.date || "",
        createdAt: tx.createdAt || new Date().toISOString()
    };
}

// Live updates. Fires immediately from the local cache, then whenever data changes.
export function subscribeTransactions(uid, onData, onError) {
    return onSnapshot(
        txCollection(uid),
        snap => onData(snap.docs.map(d => d.data())),
        onError
    );
}

// Not awaited by the UI: offline writes are queued and the snapshot updates instantly.
export function saveTransaction(uid, tx) {
    const data = clean(tx);
    return setDoc(doc(db, "users", uid, "transactions", data.id), data);
}

export function deleteTransaction(uid, id) {
    return deleteDoc(doc(db, "users", uid, "transactions", String(id)));
}

// Firestore batches are limited to 500 operations.
async function batchedWrite(items, apply) {
    for (let i = 0; i < items.length; i += 450) {
        const batch = writeBatch(db);
        items.slice(i, i + 450).forEach(item => apply(batch, item));
        await batch.commit();
    }
}

export async function clearTransactions(uid) {
    const snap = await getDocs(txCollection(uid));
    await batchedWrite(snap.docs, (batch, d) => batch.delete(d.ref));
}

export function importTransactions(uid, list) {
    return batchedWrite(list, (batch, tx) => {
        const data = clean(tx);
        batch.set(doc(db, "users", uid, "transactions", data.id), data);
    });
}
