// Turns messages that arrived in the inbox into transactions. No Firebase or DOM in here, so it is easy to test.
import { parseMpesa } from "./mpesa.js";

// docs: [{ id, text }]
// deps: { exists(txId) -> Promise<boolean>, save(tx) -> Promise, remove(docId) -> Promise }
// Messages that can't be read (Fuliza notices, other texts) are removed; a message that fails to save is kept for next time.
export async function processInbox(docs, deps, now = new Date().toISOString()) {
    const out = { added: 0, duplicates: 0, unreadable: 0, failed: 0 };
    for (const d of docs) {
        try {
            const { items } = parseMpesa(String(d.text || ""));
            if (!items.length) { out.unreadable++; await deps.remove(d.id); continue; }
            for (const it of items) {
                if (await deps.exists(it.id)) { out.duplicates++; continue; }
                await deps.save({ id: it.id, description: it.description, amount: it.amount, type: it.type, category: it.category, date: it.date, createdAt: now });
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
