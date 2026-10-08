// One-page monthly summary: preview, print / save as PDF, share as text.
export function initReport(c) {
    const esc = c.escapeHTML, fmt = c.formatCurrency;
    const pct = (a, b) => (a === b ? "unchanged" : !b ? "new" : `${a > b ? "+" : "−"}${Math.abs(((a - b) / b) * 100).toFixed(0)}%`);

    function build() {
        const list = c.getVisible(), month = c.getMonth();
        const t = c.totalsFor(list);
        const label = month === "all" ? "All time" : c.monthLabel(month);
        const exp = list.filter(x => x.type === "expense");
        const byCat = {};
        exp.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + Number(x.amount); });
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const top = [...exp].sort((a, b) => b.amount - a.amount).slice(0, 5);
        const prev = month === "all" ? null : c.totalsFor(c.inMonth(c.shiftMonth(month, -1)));
        const spent = c.spentByCategory(c.budgetMonth());
        const budgets = Object.entries(c.getBudgets()).filter(([, l]) => l > 0);
        const who = `${c.workspaceName()} · ${c.userName()}`;

        const text = [
            `PesaTrack summary: ${label}`, who, "",
            `Income: ${fmt(t.income)}`, `Expenses: ${fmt(t.expenses)}`,
            `Balance: ${fmt(t.balance)}${t.income > 0 ? ` (${t.savingsRate.toFixed(0)}% of income saved)` : ""}`,
            prev ? `Vs ${c.monthLabel(c.shiftMonth(month, -1))}: income ${pct(t.income, prev.income)}, expenses ${pct(t.expenses, prev.expenses)}` : "",
            cats.length ? "\nTop spending:" : "",
            ...cats.map(([k, v], i) => `${i + 1}. ${k}: ${fmt(v)} (${((v / t.expenses) * 100).toFixed(0)}%)`),
            budgets.length ? `\nBudgets (${c.monthLabel(c.budgetMonth())}):` : "",
            ...budgets.map(([k, l]) => `${k}: ${fmt(spent[k] || 0)} of ${fmt(l)} (${(((spent[k] || 0) / l) * 100).toFixed(0)}%)`)
        ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i)).join("\n");

        const table = (head, rows) => `<table class="rp-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
        const html = `
            <div class="rp-head"><div><h2>PesaTrack summary</h2><p>${esc(label)} · ${esc(who)}</p></div><small>Generated ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</small></div>
            <div class="rp-tiles">
                <div><small>Income</small><strong class="inc">${fmt(t.income)}</strong></div>
                <div><small>Expenses</small><strong class="exp">${fmt(t.expenses)}</strong></div>
                <div><small>Balance</small><strong>${fmt(t.balance)}</strong></div>
                <div><small>Saved</small><strong>${t.income > 0 ? t.savingsRate.toFixed(0) + "%" : "—"}</strong></div>
            </div>
            ${prev ? `<p class="rp-line">Compared with ${esc(c.monthLabel(c.shiftMonth(month, -1)))}: income <b>${pct(t.income, prev.income)}</b>, expenses <b>${pct(t.expenses, prev.expenses)}</b>.</p>` : ""}
            ${cats.length ? `<h3>Spending by category</h3>${table(["Category", "Amount", "Share"], cats.map(([k, v]) => {
                const share = (v / t.expenses) * 100;
                return `<tr><td>${c.getCategoryIcon(k)} ${esc(k)}</td><td>${fmt(v)}</td><td><span class="rp-bar"><i style="width:${share.toFixed(0)}%"></i></span> ${share.toFixed(0)}%</td></tr>`;
            }))}` : ""}
            ${top.length ? `<h3>Biggest expenses</h3>${table(["Date", "Description", "Amount"], top.map(x => `<tr><td>${c.formatDate(x.date)}</td><td>${esc(x.description)}</td><td>${fmt(x.amount)}</td></tr>`))}` : ""}
            ${budgets.length ? `<h3>Budgets · ${esc(c.monthLabel(c.budgetMonth()))}</h3>${table(["Category", "Spent", "Budget", "Used"], budgets.map(([k, l]) => {
                const used = ((spent[k] || 0) / l) * 100;
                return `<tr><td>${c.getCategoryIcon(k)} ${esc(k)}</td><td>${fmt(spent[k] || 0)}</td><td>${fmt(l)}</td><td class="${used >= 100 ? "exp" : ""}">${used.toFixed(0)}%</td></tr>`;
            }))}` : ""}
            ${!list.length ? `<p class="rp-line">No transactions in this period yet.</p>` : ""}`;
        return { html, text, label };
    }

    function open() {
        const { html, text, label } = build();
        const { overlay, close } = c.openOverlay(`
            <div class="report-sheet" id="reportSheet">${html}</div>
            <div class="modal-actions report-actions">
                <button type="button" class="secondary-button" data-close>Close</button>
                <button type="button" class="secondary-button" data-rp="copy">Copy text</button>
                <button type="button" class="secondary-button" data-rp="share">Share</button>
                <button type="button" class="primary-button" data-rp="print">Print / Save as PDF</button>
            </div>`, true);
        overlay.classList.add("report-overlay");
        overlay.addEventListener("click", async e => {
            const act = e.target.dataset?.rp;
            if (act === "print") {
                document.body.classList.add("print-report");
                const done = () => { document.body.classList.remove("print-report"); window.removeEventListener("afterprint", done); };
                window.addEventListener("afterprint", done);
                window.print();
            }
            if (act === "copy") {
                try { await navigator.clipboard.writeText(text); c.toast("Summary copied", "success"); }
                catch { c.toast("Couldn't copy. Try Share or Print instead.", "error"); }
            }
            if (act === "share") {
                if (navigator.share) { try { await navigator.share({ title: `PesaTrack summary: ${label}`, text }); } catch { /* cancelled */ } }
                else { try { await navigator.clipboard.writeText(text); c.toast("Sharing isn't available here, so the text was copied.", "success"); } catch { c.toast("Sharing isn't available on this device.", "error"); } }
            }
        });
        return close;
    }
    document.querySelectorAll("[data-open-report]").forEach(b => b.addEventListener("click", open));
    return { open, build };
}
