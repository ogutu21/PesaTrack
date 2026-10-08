// Backup (download everything as a JSON file) and restore (merge or replace).
import { sanitize, importTransactions, clearTransactions, saveBudgets, saveItems, saveCurrency } from "./firestore.js";
import { getBase, getRates, CURRENCIES } from "./currency.js";

const LIMIT_BYTES = 5 * 1024 * 1024, MAX_TX = 20000;
const ITEM_KEYS = ["goals", "recurring", "categories"];

export function initBackup(c) {
    const esc = c.escapeHTML;
    const today = () => c.localToday();

    function exportBackup() {
        const data = {
            app: "PesaTrack", version: 2, exportedAt: new Date().toISOString(), workspace: c.workspaceName(),
            currency: { base: getBase(), rates: getRates() },
            budgets: c.getBudgets(), ...c.getFeatureData(),
            transactions: c.getTransactions()
        };
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        link.download = `pesatrack-backup-${today()}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        c.toast(`Backup saved (${data.transactions.length} transactions)`, "success");
    }

    const cleanItems = list => (Array.isArray(list) ? list : []).filter(x => x && typeof x === "object" && x.id).slice(0, 200);
    const mergeById = (current, incoming) => [...new Map([...current, ...incoming].map(x => [x.id, x])).values()].slice(0, 200);

    async function readFile(file) {
        if (!file) return;
        if (file.size > LIMIT_BYTES) return c.toast("That file is too large to be a PesaTrack backup.", "error");
        let data;
        try { data = JSON.parse(await file.text()); } catch { return c.toast("That file isn't a valid PesaTrack backup.", "error"); }
        if (!data || data.app !== "PesaTrack" || !Array.isArray(data.transactions)) return c.toast("That file isn't a PesaTrack backup.", "error");

        const all = data.transactions.slice(0, MAX_TX);
        const valid = all.map(sanitize).filter(Boolean);
        const skipped = data.transactions.length - valid.length;
        const budgets = Object.fromEntries(Object.entries(data.budgets || {}).filter(([k, v]) => Number(v) > 0 && typeof k === "string").map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]));
        const items = Object.fromEntries(ITEM_KEYS.map(k => [k, cleanItems(data[k])]));
        const cur = data.currency && /^[A-Z]{3}$/.test(data.currency.base || "") && CURRENCIES.some(([code]) => code === data.currency.base) ? data.currency : null;

        const { overlay, close } = c.openOverlay(`
            <h3>Restore from backup</h3>
            <p class="confirm-text">Backup from ${esc(new Date(data.exportedAt || Date.now()).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }))}
                (${esc(String(data.workspace || "PesaTrack"))}):<br>
                <strong>${valid.length}</strong> transactions, <strong>${Object.keys(budgets).length}</strong> budgets,
                <strong>${items.goals.length}</strong> goals, <strong>${items.recurring.length}</strong> recurring,
                <strong>${items.categories.length}</strong> custom categories${skipped ? `<br><span class="muted">${skipped} invalid entries will be skipped.</span>` : ""}</p>
            <label class="mp-fee"><input type="radio" name="rmode" value="merge" checked> <span><strong>Merge</strong>: add to what you have (matching items are updated)</span></label>
            <label class="mp-fee"><input type="radio" name="rmode" value="replace"> <span><strong>Replace</strong>: delete current transactions first, then restore</span></label>
            <div class="modal-actions">
                <button type="button" class="secondary-button" data-close>Cancel</button>
                <button type="button" class="primary-button" id="restoreGo" ${valid.length || Object.keys(budgets).length ? "" : "disabled"}>Restore</button>
            </div>`);
        overlay.querySelector("#restoreGo").addEventListener("click", async () => {
            const mode = overlay.querySelector("input[name=rmode]:checked").value;
            if (mode === "replace" && !(await c.confirmDialog("Replace will delete all current transactions in this space before restoring. Continue?", "Replace"))) return;
            const uid = c.getUser().uid;
            overlay.querySelector("#restoreGo").disabled = true;
            try {
                if (mode === "replace") await clearTransactions(uid);
                await importTransactions(uid, valid);
                await saveBudgets(uid, mode === "replace" ? budgets : { ...c.getBudgets(), ...budgets });
                const current = c.getFeatureData();
                for (const k of ITEM_KEYS) {
                    if (items[k].length || mode === "replace") await saveItems(uid, k, mode === "replace" ? items[k] : mergeById(current[k], items[k]));
                }
                if (cur) {
                    const rates = mode === "replace" ? cur.rates : { ...getRates(), ...cur.rates };
                    await saveCurrency(uid, mode === "replace" ? cur.base : getBase(), rates || {});
                }
                close();
                c.toast(`Restored ${valid.length} transactions`, "success");
            } catch (e) {
                console.error("Restore failed:", e);
                overlay.querySelector("#restoreGo").disabled = false;
                c.toast("Restore failed part-way. Check your connection and try again.", "error");
            }
        });
    }

    document.querySelectorAll("[data-backup]").forEach(b => b.addEventListener("click", exportBackup));
    const input = c.$("restoreFile");
    document.querySelectorAll("[data-restore]").forEach(b => b.addEventListener("click", () => input.click()));
    input.addEventListener("change", () => { readFile(input.files[0]); input.value = ""; });
    return { exportBackup };
}
