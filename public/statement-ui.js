// "Import M-Pesa statement" dialog. All app helpers are passed in, so this file has no imports from script.js.
import { parseStatement } from "./statement.js";
import { readPdf } from "./statement-pdf.js";

export function openStatementImport(ctx) {
    const { openOverlay, categoriesFor, getCategoryIcon, escapeHTML, formatCurrency, formatDate, toast, importTransactions, existingIds, onImported } = ctx;
    const { overlay, close } = openOverlay(`
        <h3>Import M-Pesa statement</h3>
        <p class="confirm-text">Choose the PDF statement from Safaricom (dial *334# or the M-Pesa app, then Statements). Everything is read on your phone; the file is never uploaded.</p>
        <input type="file" id="stFile" accept="application/pdf,.pdf">
        <div id="stPass" hidden>
            <p class="mp-note" id="stPassMsg"></p>
            <input type="password" id="stPassInput" placeholder="Statement password" autocomplete="off">
            <div class="modal-actions"><button type="button" class="primary-button" id="stPassGo">Unlock</button></div>
        </div>
        <p class="mp-note" id="stStatus"></p>
        <div id="stResult"></div>
        <div class="modal-actions"><button type="button" class="secondary-button" data-close>Close</button></div>`, true);

    const $ = s => overlay.querySelector(s);
    const state = { items: [], check: null, from: "", fees: true, transfers: false, showAll: false, cats: new Map() };
    const existing = existingIds();

    const catOptions = (type, current) => {
        const names = categoriesFor(type).map(c => c.name);
        if (!names.includes(current)) names.unshift(current);
        return names.map(n => `<option value="${escapeHTML(n)}" ${n === current ? "selected" : ""}>${getCategoryIcon(n)} ${escapeHTML(n)}</option>`).join("");
    };
    const catOf = it => state.cats.get(it.group) || it.category;

    // Items that would actually be saved right now.
    function chosen() {
        return state.items.filter(i =>
            (!state.from || i.date >= state.from) &&
            (state.transfers || !i.internal) &&
            (state.fees || i.kind !== "fee") &&
            !existing.has(i.id));
    }

    function render() {
        const box = $("#stResult");
        if (!state.items.length) { box.innerHTML = ""; return; }
        const pick = chosen();
        const dups = state.items.filter(i => existing.has(i.id) && (!state.from || i.date >= state.from) && (state.transfers || !i.internal)).length;
        const inSum = pick.filter(i => i.type === "income").reduce((s, i) => s + i.amount, 0);
        const outSum = pick.filter(i => i.type === "expense").reduce((s, i) => s + i.amount + (state.fees ? i.fee : 0), 0);
        const feeCount = state.items.filter(i => i.fee > 0).length;
        const writes = pick.length + (state.fees ? pick.filter(i => i.fee > 0).length : 0);
        const c = state.check;
        const badge = c && c.ok === true ? `<p class="mp-note">✅ Matches your statement totals exactly (in ${formatCurrency(c.paidIn)}, out ${formatCurrency(c.paidOut)}).</p>`
            : c && c.ok === false ? `<p class="mp-note">⚠️ Totals differ from the statement (read in ${formatCurrency(c.paidIn)} vs ${formatCurrency(c.expectedIn)}; out ${formatCurrency(c.paidOut)} vs ${formatCurrency(c.expectedOut)}). Check the result before importing.</p>`
            : `<p class="mp-note">Couldn't find the statement totals to double check against.</p>`;

        // groups of similar transactions, so a category is chosen once per person/shop
        const groups = new Map();
        for (const i of pick) {
            if (i.kind === "fee") continue;
            const g = groups.get(i.group) || { key: i.group, type: i.type, name: i.party || i.description, kind: i.kind, n: 0, sum: 0 };
            g.n++; g.sum += i.amount; groups.set(i.group, g);
        }
        const list = [...groups.values()].sort((a, b) => b.sum - a.sum);
        const shown = state.showAll ? list : list.slice(0, 25);
        const label = g => ({ sent: "Sent to", paid: "Paid to", paybill: "Paid to", received: "From", airtime: "", deposit: "", withdraw: "", reversal: "", transfer: "" }[g.kind] || "");

        box.innerHTML = `
            ${badge}
            <div class="mp-controls">
                <label>From date <input type="date" id="stFrom" value="${escapeHTML(state.from)}"></label>
                ${feeCount ? `<label class="mp-fee"><input type="checkbox" id="stFees" ${state.fees ? "checked" : ""}> Record M-Pesa fees as expenses</label>` : ""}
                <label class="mp-fee"><input type="checkbox" id="stTransfers" ${state.transfers ? "checked" : ""}> Include M-Shwari and KCB M-Pesa transfers (your own money moving between accounts)</label>
            </div>
            <p class="mp-note"><strong>${writes}</strong> to import · income ${formatCurrency(inSum)} · spending ${formatCurrency(outSum)}${dups ? ` · ${dups} already in your app (skipped)` : ""}</p>
            <p class="mp-note">Set a category once for each person or shop below. Biggest first.</p>
            <div class="mp-list">
                ${shown.map(g => `
                    <div class="mp-row">
                        <div class="mp-main"><strong>${escapeHTML(g.name)}</strong>
                            <small>${label(g) ? label(g) + " · " : ""}${g.n} time${g.n === 1 ? "" : "s"}</small></div>
                        <select data-group="${escapeHTML(g.key)}" aria-label="Category for ${escapeHTML(g.name)}">${catOptions(g.type, state.cats.get(g.key) || pick.find(i => i.group === g.key).category)}</select>
                        <span class="mp-amt ${g.type}">${g.type === "income" ? "+" : "-"}${formatCurrency(g.sum)}</span>
                    </div>`).join("")}
            </div>
            ${list.length > 25 ? `<button type="button" class="secondary-button" id="stMore">${state.showAll ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}
            <div class="modal-actions">
                <button type="button" class="primary-button" id="stImport" ${pick.length ? "" : "disabled"}>${`Import ${writes} transaction${writes === 1 ? "" : "s"}`}</button>
            </div>`;
    }

    async function readFile(file) {
        const status = $("#stStatus");
        $("#stResult").innerHTML = "";
        state.items = [];
        try {
            status.textContent = "Reading the PDF…";
            const pages = await readPdf(file, {
                onProgress: (n, total) => { status.textContent = `Reading page ${n} of ${total}…`; },
                askPassword: wrong => new Promise(resolve => {
                    $("#stPass").hidden = false;
                    $("#stPassMsg").textContent = wrong ? "That password didn't work. Try again." : "This statement is password protected. Safaricom usually uses your ID number or the password they SMSed you.";
                    const input = $("#stPassInput"); input.value = ""; input.focus();
                    const go = $("#stPassGo");
                    const done = () => { go.removeEventListener("click", done); $("#stPass").hidden = true; resolve(input.value); };
                    go.addEventListener("click", done);
                })
            });
            const r = parseStatement(pages);
            if (!r.rowCount) { status.textContent = "This doesn't look like an M-Pesa statement: I couldn't find any transactions in it."; return; }
            state.items = r.items; state.check = r.check;
            state.from = r.items.length ? r.items[r.items.length - 1].date : "";
            status.textContent = `${file.name}: found ${r.rowCount} lines${r.summary && r.summary.period ? " (" + r.summary.period + ")" : ""}.`;
            render();
        } catch (err) {
            status.textContent = err && err.cancelled ? "Cancelled." : "Couldn't read that file. Make sure it's the PDF statement from Safaricom.";
            if (!(err && err.cancelled)) console.error(err);
        }
    }

    $("#stFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) readFile(f); });
    $("#stPassInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#stPassGo").click(); });

    overlay.addEventListener("change", e => {
        const t = e.target;
        if (t.id === "stFrom") state.from = t.value;
        else if (t.id === "stFees") state.fees = t.checked;
        else if (t.id === "stTransfers") state.transfers = t.checked;
        else if (t.dataset.group !== undefined) { state.cats.set(t.dataset.group, t.value); return; }
        else return;
        render();
    });

    overlay.addEventListener("click", async e => {
        if (e.target.id === "stMore") { state.showAll = !state.showAll; render(); return; }
        if (e.target.id !== "stImport") return;
        const now = new Date().toISOString(), txs = [], ids = new Set();
        const add = t => { if (!ids.has(t.id) && !existing.has(t.id)) { ids.add(t.id); txs.push(t); } };
        for (const i of chosen()) {
            add({ id: i.id, description: i.description, amount: i.amount, type: i.type, category: catOf(i), date: i.date, createdAt: now });
            if (state.fees && i.fee > 0) add({ id: `${i.id}-fee`, description: `M-Pesa fee (${i.code})`, amount: i.fee, type: "expense", category: "Fees & Charges", date: i.date, createdAt: now });
        }
        if (!txs.length) return;
        // Same as the SMS importer: writes are queued (they also work offline), so don't wait on the network.
        Promise.resolve(importTransactions(ctx.uid(), txs)).catch(ctx.reportWriteError);
        close();
        if (onImported) onImported(txs);
        toast(`Imported ${txs.length} transaction${txs.length === 1 ? "" : "s"} from your statement`, "success");
    });
}
