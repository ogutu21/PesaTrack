// "Import from M-Pesa": paste messages or choose a backup file, review, then import.
// Built for large histories: summary first, rows shown in pages, saved in batches.
import { parseMpesa } from "./mpesa.js";
import { extractMessages } from "./smsfile.js";

const PAGE = 100, MAX_BYTES = 80 * 1024 * 1024, OFFLINE_WAIT_MS = 8000;

export function initMpesaImport(c) {
    const esc = c.escapeHTML, fmt = c.formatCurrency;

    function open(prefill = "") {
        if (typeof prefill !== "string") prefill = "";   // never treat a click event as message text
        const user = c.getUser();
        if (!user) return;
        const { overlay, close } = c.openOverlay(`
            <h3>Import from M-Pesa</h3>
            <p class="confirm-text">Paste messages or choose a backup file. You review everything before it's saved, and messages you've already imported are skipped.</p>
            <textarea id="mpesaText" rows="4" placeholder="QGH7A1B2C3 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 17/7/24 at 2:15 PM..."></textarea>
            <input type="file" id="mpesaFile" accept=".xml,.json,.csv,.txt,text/xml,application/xml,application/json,text/plain,text/csv" hidden>
            <div class="modal-actions">
                <button type="button" class="secondary-button" data-close>Close</button>
                <button type="button" class="secondary-button" id="mpesaFileBtn">📁 From a file</button>
                <button type="button" class="secondary-button" id="mpesaPaste">📋 Paste</button>
                <button type="button" class="primary-button" id="mpesaParse">Read messages</button>
            </div>
            <details class="guide"><summary>How do I import my old messages?</summary>
                <ol>
                    <li><strong>Android:</strong> install “SMS Backup &amp; Restore”, back up your messages as XML (you can limit it to M-Pesa), then tap <em>From a file</em> and choose the file.</li>
                    <li><strong>iPhone:</strong> iOS can't export texts in bulk. You can copy messages from the MPESA conversation and tap <em>Paste</em>. Very long histories are easier from an Android backup.</li>
                    <li>The file is read on your phone. Only the transactions are saved to your account, never the messages themselves.</li>
                </ol></details>
            <div id="mpesaResult"></div>`, true);

        const $r = sel => overlay.querySelector(sel);
        const existing = new Set(c.getTransactions().map(t => t.id));
        let parsed = null;

        const catOptions = it => {
            const names = c.categoriesFor(it.type).map(x => x.name);
            if (!names.includes(it.category)) names.unshift(it.category);
            return names.map(n => `<option value="${esc(n)}" ${n === it.category ? "selected" : ""}>${c.getCategoryIcon(n)} ${esc(n)}</option>`).join("");
        };

        function ingest(text, info) {
            const result = parseMpesa(text);
            parsed = { skipped: result.skipped, fees: true, shown: PAGE, filter: "all", info,
                items: result.items.map((it, i) => ({ ...it, _i: i, tags: ["mpesa"], dup: existing.has(it.id), selected: !existing.has(it.id) })) };
            render();
        }

        function totals() {
            const fresh = parsed.items.filter(i => !i.dup);
            const sel = parsed.items.filter(i => i.selected);
            const sum = (list, type) => list.filter(i => i.type === type).reduce((s, i) => s + i.amount, 0);
            const dates = fresh.map(i => i.date).sort();
            return { fresh, sel, income: sum(fresh, "income"), spent: sum(fresh, "expense"), from: dates[0], to: dates.at(-1),
                fees: sel.reduce((s, i) => s + (i.fee || 0), 0), dups: parsed.items.length - fresh.length };
        }

        function footer() {   // keeps scroll position: updates only the button and fee text
            const t = totals();
            const btn = $r("#mpesaImport");
            if (btn) {
                const n = t.sel.length + (parsed.fees ? t.sel.filter(i => i.fee > 0).length : 0);
                btn.disabled = !t.sel.length;
                btn.textContent = `Import ${t.sel.length} transaction${t.sel.length === 1 ? "" : "s"}${n !== t.sel.length ? ` + ${n - t.sel.length} fees` : ""}`;
            }
            const feeAmt = $r("#mpFeeAmt");
            if (feeAmt) feeAmt.textContent = fmt(t.fees);
        }

        function render() {
            const box = $r("#mpesaResult"), { items, skipped, info } = parsed;
            const reasons = [...new Set(skipped.map(s => s.reason))].join(", ");
            if (!items.length) {
                box.innerHTML = `<p class="mp-note">No transactions found${info?.total ? ` (${info.total} messages checked)` : ""}. Make sure the messages include their transaction code, like QGH7A1B2C3.${skipped.length ? ` ${skipped.length} were skipped (${esc(reasons)}).` : ""}</p>`;
                return;
            }
            const t = totals();
            const list = parsed.filter === "other" ? items.filter(i => i.category === "Other" && !i.dup) : items;
            const rows = list.slice(0, parsed.shown);
            box.innerHTML = `
                <div class="mp-summary">
                    <div><strong>${t.fresh.length}</strong><span>new transactions</span></div>
                    <div><strong class="inc">${fmt(t.income)}</strong><span>income</span></div>
                    <div><strong class="exp">${fmt(t.spent)}</strong><span>spent</span></div>
                    <div><strong>${t.dups}</strong><span>already added</span></div>
                </div>
                <p class="mp-note">${t.from ? `${c.formatDate(t.from)} to ${c.formatDate(t.to)}. ` : ""}${info?.kind ? `Read ${info.total || items.length} messages from ${esc(info.file || "the text")} (${esc(info.kind)}). ` : ""}</p>
                <div class="mp-tools">
                    <select id="mpFilter" aria-label="Show"><option value="all" ${parsed.filter === "all" ? "selected" : ""}>Show everything</option>
                        <option value="other" ${parsed.filter === "other" ? "selected" : ""}>Needs a category (Other)</option></select>
                    <button type="button" class="link-button" id="mpAll">Select all new</button>
                    <button type="button" class="link-button" id="mpNone">Select none</button>
                </div>
                <div class="mp-list">${rows.map(it => `
                    <label class="mp-row ${it.dup ? "dup" : ""}">
                        <input type="checkbox" data-sel="${it._i}" ${it.selected ? "checked" : ""} ${it.dup ? "disabled" : ""}>
                        <div class="mp-main"><strong>${esc(it.description)}</strong><small>${c.formatDate(it.date)}${it.dup ? " · already added" : ""}</small></div>
                        <select data-cat="${it._i}" ${it.dup ? "disabled" : ""}>${catOptions(it)}</select>
                        <span class="mp-amt ${it.type}">${it.type === "income" ? "+" : "-"}${fmt(it.amount)}</span>
                    </label>`).join("") || `<p class="mp-note">Nothing to show here.</p>`}</div>
                ${list.length > rows.length ? `<button type="button" class="secondary-button" id="mpMore">Show ${Math.min(PAGE, list.length - rows.length)} more (${list.length - rows.length} left)</button>` : ""}
                ${items.some(i => i.fee > 0) ? `<label class="mp-fee"><input type="checkbox" id="mpesaFees" ${parsed.fees ? "checked" : ""}> Also record M-Pesa transaction fees as expenses (<span id="mpFeeAmt">${fmt(t.fees)}</span>)</label>` : ""}
                ${skipped.length ? `<p class="mp-note">${skipped.length} message${skipped.length === 1 ? "" : "s"} skipped (${esc(reasons)}). <button type="button" class="link-button" id="mpCopySkipped">Copy examples</button></p>` : ""}
                <div class="modal-actions"><button type="button" class="primary-button" id="mpesaImport"></button></div>`;
            footer();
        }

        async function loadFile(file) {
            if (!file) return;
            if (file.size > MAX_BYTES) return c.toast("That file is too large to import.", "error");
            $r("#mpesaResult").innerHTML = `<p class="mp-note">Reading ${esc(file.name)}…</p>`;
            try {
                const r = extractMessages(await file.text());
                if (!r.messages.length) { $r("#mpesaResult").innerHTML = `<p class="mp-note">No M-Pesa messages found in this file (${r.total} messages checked).</p>`; return; }
                ingest(r.messages.join("\n"), { kind: r.kind, total: r.total, file: file.name });
            } catch (e) { console.error(e); c.toast("Couldn't read that file.", "error"); $r("#mpesaResult").innerHTML = ""; }
        }

        async function doImport() {
            const now = new Date().toISOString(), txs = [];
            parsed.items.filter(i => i.selected).forEach(i => {
                txs.push({ id: i.id, description: i.description, amount: i.amount, type: i.type, category: i.category,
                    date: i.date, tags: ["mpesa"], createdAt: now });
                if (parsed.fees && i.fee > 0 && !existing.has(`${i.id}-fee`)) {
                    txs.push({ id: `${i.id}-fee`, description: `M-Pesa fee (${i.code || "SMS"})`, amount: i.fee, type: "expense",
                        category: "Fees & Charges", date: i.date, tags: ["mpesa"], createdAt: now });
                }
            });
            if (!txs.length) return;
            const btn = $r("#mpesaImport");
            btn.disabled = true;
            let offline = false;
            const work = (async () => {
                for (let i = 0; i < txs.length; i += 450) {
                    await c.importTransactions(user.uid, txs.slice(i, i + 450));
                    if (!offline) btn.textContent = `Importing ${Math.min(i + 450, txs.length)} of ${txs.length}…`;
                }
            })();
            try {
                await Promise.race([work, new Promise(res => setTimeout(() => { offline = true; res(); }, txs.length > 450 ? 60000 : OFFLINE_WAIT_MS))]);
            } catch (e) { c.reportWriteError(e); btn.disabled = false; footer(); return; }
            c.showMonthFor(txs.map(t => t.date));
            close();
            c.toast(offline ? `Saved ${txs.length} transactions on this device. They'll sync when you're back online.` : `Imported ${txs.length} transaction${txs.length === 1 ? "" : "s"} from M-Pesa`, "success");
        }

        $r("#mpesaParse").addEventListener("click", () => ingest($r("#mpesaText").value, { kind: "pasted text" }));
        $r("#mpesaFileBtn").addEventListener("click", () => $r("#mpesaFile").click());
        $r("#mpesaFile").addEventListener("change", e => { loadFile(e.target.files[0]); e.target.value = ""; });
        $r("#mpesaPaste").addEventListener("click", async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text.trim()) return c.toast("Your clipboard is empty. Copy an M-Pesa message first.");
                $r("#mpesaText").value = text;
                $r("#mpesaParse").click();
            } catch { c.toast("Couldn't read the clipboard. Paste into the box instead."); }
        });

        overlay.addEventListener("change", e => {
            const t = e.target;
            if (!parsed) return;
            if (t.dataset.sel !== undefined) { parsed.items[t.dataset.sel].selected = t.checked; footer(); }
            if (t.dataset.cat !== undefined) parsed.items[t.dataset.cat].category = t.value;
            if (t.id === "mpesaFees") { parsed.fees = t.checked; footer(); }
            if (t.id === "mpFilter") { parsed.filter = t.value; parsed.shown = PAGE; render(); }
        });
        overlay.addEventListener("click", async e => {
            const id = e.target.id;
            if (!parsed) return;
            if (id === "mpMore") { parsed.shown += PAGE; render(); }
            if (id === "mpAll") { parsed.items.forEach(i => { if (!i.dup) i.selected = true; }); render(); }
            if (id === "mpNone") { parsed.items.forEach(i => { i.selected = false; }); render(); }
            if (id === "mpesaImport") doImport();
            if (id === "mpCopySkipped") {
                const sample = parsed.skipped.slice(0, 15).map(s => s.text).join("\n");
                try { await navigator.clipboard.writeText(sample); c.toast("Copied. Remove names and numbers before sharing.", "success"); }
                catch { c.toast("Couldn't copy to the clipboard.", "error"); }
            }
        });

        if (prefill) { $r("#mpesaText").value = prefill; ingest(prefill, { kind: "shared text" }); }
    }
    return { open };
}
