// Turns messages that arrived in the inbox into transactions. No Firebase or DOM in here, so it is easy to test.
import { parseMpesa } from "./mpesa.js";
import { payeeKey } from "./payee-core.js";   // payee-memory-v1

// the category you chose last time for this person or till, if any
const learnedCategory = (it, learned) => { const k = payeeKey(it.description, it.type); return (k && learned[k]) || it.category; };

// docs: [{ id, text }]
// deps: { exists(txId) -> Promise<boolean>, save(tx) -> Promise, remove(docId) -> Promise, saveTransfer(t) -> Promise }
// A "transfer" is a move to or from your own M-Shwari / KCB M-PESA savings: it updates a balance, not your income or spending.
// Messages that can't be read (Fuliza notices, other texts) are removed; a message that fails to save is kept for next time.
export async function processInbox(docs, deps, now = new Date().toISOString()) {
    const out = { added: 0, duplicates: 0, unreadable: 0, failed: 0, transfers: 0 };
    let learned = {};
    try { if (deps.payees) learned = (await deps.payees()) || {}; } catch {}   // memory unavailable: use the built-in guesses
    for (const d of docs) {
        try {
            const { items, transfers } = parseMpesa(String(d.text || ""));
            if (!items.length && !transfers.length) { out.unreadable++; await deps.remove(d.id); continue; }
            for (const t of transfers) { if (deps.saveTransfer) await deps.saveTransfer(t); out.transfers++; }
            for (const it of items) {
                if (await deps.exists(it.id)) { out.duplicates++; continue; }
                await deps.save({ id: it.id, description: it.description, amount: it.amount, type: it.type, category: learnedCategory(it, learned), date: it.date, createdAt: now });
                out.added++;
                if (it.fee > 0) {
                    await deps.save({ id: `${it.id}-fee`, description: `M-Pesa fee (${it.code || "SMS"})`, amount: it.fee, type: "expense",
                        category: "Fees & Charges", date: it.date, createdAt: now });
                }
            }
            await deps.remove(d.id);
        } catch (e) {
            out.failed++;
        }
    }
    return out;
}

export const addedMessage = r =>
    `${r.added} M-Pesa transaction${r.added === 1 ? "" : "s"} added automatically`;
