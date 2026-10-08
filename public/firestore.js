// PesaTrack data layer: all Firestore access lives here.
// Data lives in a "root": the signed-in user's own space, or a shared household.
import { db } from "./firebase-config.js";
import {
    doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField, collection, onSnapshot, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

let activeRoot = null;                                  // null = the user's own space
export const useRoot = segments => { activeRoot = segments; };
const rootOf = uid => activeRoot || ["users", uid];
const personal = uid => ["users", uid];

// ---------- transactions ----------
const txCollection = uid => collection(db, ...rootOf(uid), "transactions");
const txDoc = (uid, id) => doc(db, ...rootOf(uid), "transactions", String(id));
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");

export function normalizeTags(value) {
    const list = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
    return [...new Set(list.map(t => String(t).toLowerCase().replace(/^#+/, "").trim().slice(0, 20)).filter(Boolean))].slice(0, 5);
}

function clean(tx) {
    const out = {
        id: String(tx.id),
        description: String(tx.description || "").slice(0, 200),
        amount: Math.round((Number(tx.amount) || 0) * 100) / 100,
        type: tx.type === "income" ? "income" : "expense",
        category: tx.category || "Other",
        date: tx.date || "",
        createdAt: tx.createdAt || new Date().toISOString()
    };
    const note = String(tx.note || "").trim().slice(0, 200);
    if (note) out.note = note;
    const tags = normalizeTags(tx.tags);
    if (tags.length) out.tags = tags;
    if (tx.orig && /^[A-Za-z]{3}$/.test(String(tx.orig.currency)) && Number(tx.orig.amount) > 0) {
        out.orig = { currency: String(tx.orig.currency).toUpperCase(), amount: Math.round(Number(tx.orig.amount) * 100) / 100 };
    }
    if (tx.by) out.by = String(tx.by).slice(0, 40);
    return out;
}

// For restoring backups: returns a safe transaction, or null when it can't be used.
export function sanitize(tx) {
    if (!tx || typeof tx !== "object") return null;
    const id = String(tx.id ?? "");
    if (!id || id.length > 100 || id.includes("/")) return null;
    if (!(Number(tx.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(tx.date))) return null;
    return clean({ ...tx, id });
}

// Live updates. Fires immediately from the local cache, then whenever data changes.
export function subscribeTransactions(uid, onData, onError) {
    return onSnapshot(txCollection(uid), snap => onData(snap.docs.map(d => d.data())), onError);
}
// Not awaited by the UI: offline writes are queued and the snapshot updates instantly.
export const saveTransaction = (uid, tx) => { const data = clean(tx); return setDoc(txDoc(uid, data.id), data); };
export const deleteTransaction = (uid, id) => deleteDoc(txDoc(uid, id));

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
    return batchedWrite(list, (batch, tx) => { const data = clean(tx); batch.set(txDoc(uid, data.id), data); });
}

// ---------- settings documents (follow the active root) ----------
const settingsDoc = (uid, name) => doc(db, ...rootOf(uid), "settings", name);

export const subscribeBudgets = (uid, onData, onError) =>
    onSnapshot(settingsDoc(uid, "budgets"), snap => onData(snap.exists() ? (snap.data().limits || {}) : {}), onError);
export const saveBudgets = (uid, limits) => setDoc(settingsDoc(uid, "budgets"), { limits, updatedAt: new Date().toISOString() });

export const subscribeItems = (uid, name, onData, onError) =>
    onSnapshot(settingsDoc(uid, name), snap => onData(snap.exists() ? (snap.data().items || []) : []), onError);
export const saveItems = (uid, name, items) => setDoc(settingsDoc(uid, name), { items, updatedAt: new Date().toISOString() });

// Currency settings: { base, rates }
export const subscribeCurrency = (uid, onData, onError) =>
    onSnapshot(settingsDoc(uid, "currency"), snap => onData(snap.exists() ? snap.data() : null), onError);
export const saveCurrency = (uid, base, rates) => setDoc(settingsDoc(uid, "currency"), { base, rates, updatedAt: new Date().toISOString() });

// ---------- the user's list of households (always in their personal space) ----------
const myHouseholdsDoc = uid => doc(db, ...personal(uid), "settings", "households");
export const subscribeMyHouseholds = (uid, onData, onError) =>
    onSnapshot(myHouseholdsDoc(uid), snap => onData(snap.exists() ? (snap.data().items || []) : []), onError);
export const saveMyHouseholds = (uid, items) => setDoc(myHouseholdsDoc(uid), { items, updatedAt: new Date().toISOString() });

// ---------- households ----------
const hhDoc = hid => doc(db, "households", hid);
const iso = () => new Date().toISOString();

export const subscribeHousehold = (hid, onData, onError) =>
    onSnapshot(hhDoc(hid), snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
export async function getHousehold(hid) {
    const snap = await getDoc(hhDoc(hid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function createHousehold(uid, name, displayName) {
    const id = rand(10), secret = rand(12);
    await setDoc(hhDoc(id), { name, ownerId: uid, inviteSecret: secret, createdAt: iso(),
        members: { [uid]: { name: displayName, role: "owner", joinedAt: iso() } } });
    return { id, name };
}
// Joining works by presenting the invite secret in the same write that adds you as a member.
export const joinHousehold = (uid, hid, secret, displayName) =>
    updateDoc(hhDoc(hid), { [`members.${uid}`]: { name: displayName, role: "member", joinedAt: iso() }, joinSecret: secret });
export const removeHouseholdMember = (hid, memberUid) => updateDoc(hhDoc(hid), { [`members.${memberUid}`]: deleteField() });
export const rotateInvite = hid => updateDoc(hhDoc(hid), { inviteSecret: rand(12), joinSecret: deleteField() });
