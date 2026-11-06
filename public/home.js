// Home screen extras: action buttons, frequent payees, "vs last month" chip, and Insights tabs on Reports.
// Everything is injected into the existing page, so the HTML only needs this module to be wired in.
import { donutHTML } from "./charts.js";

const ICON = {
    expense: '<path d="M12 5v14M5 12h14"/>',
    income: '<path d="M7 17L17 7M8 7h9v9"/>',
    import: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"/>'
};
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const TABS = [["overview", "Overview"], ["income", "Income"], ["expenses", "Expenses"], ["goals", "Goals"]];

export function initHome(c) {
    const { $, escapeHTML, getAll, getMonth, totalsFor, inMonth, shiftMonth, monthLabel, colorFor, formatCurrency } = c;
    let built = false;

    function build() {
        const grid = document.querySelector(".summary-grid");
        if (!grid) return;
        built = true;

        const actions = document.createElement("div");
        actions.className = "quick-actions"; actions.id = "quickActions";
        actions.innerHTML = [["expense", "Add expense"], ["income", "Add income"], ["import", "Import"], ["report", "Report"]]
            .map(([k, label]) => `<button type="button" class="qa" data-act="${k}"><span class="qa-dot">${svg(ICON[k])}</span><span>${label}</span></button>`).join("");
        actions.addEventListener("click", e => {
            const b = e.target.closest("[data-act]"); if (!b) return;
            const act = b.dataset.act;
            if (act === "expense" || act === "income") c.addTx(act);
            else if (act === "import") (document.querySelector("[data-open-statement]") || document.querySelector("[data-open-mpesa]"))?.click();
            else if (act === "report") document.querySelector("[data-open-report]")?.click();
        });
        grid.after(actions);

        const pay = document.createElement("section");
        pay.className = "payees"; pay.id = "payees"; pay.hidden = true;
        pay.innerHTML = `<h3>Frequent</h3><div class="payee-row" id="payeeRow"></div>`;
        pay.addEventListener("click", e => {
            const b = e.target.closest("[data-payee]"); if (!b) return;
            const p = payeeList[Number(b.dataset.payee)];
            if (p) c.addTx("expense", { description: p.description, amount: p.amount, category: p.category });
        });
        actions.after(pay);

        // Insights tabs on Reports
        const reports = $("reports");
        if (reports) {
            const tag = (el, tabs) => { const card = el && el.closest(".card"); if (card) card.dataset.in = tabs; };
            tag($("reportIncome"), "overview income");
            tag($("categoryChart"), "overview expenses");
            tag($("comparisonCard"), "overview");
            tag($("trendChart"), "overview income");
            tag($("donutChart"), "expenses");
            tag($("budgetList"), "expenses goals");
            const extra = reports.querySelector(".reports-extra") || reports;
            const inc = document.createElement("div");
            inc.className = "card"; inc.dataset.in = "income";
            inc.innerHTML = `<div class="card-header"><div><h3>Income sources</h3><p>Where your money comes from.</p></div></div><div id="incomeDonut"></div>`;
            extra.append(inc);
            const goals = document.createElement("div");
            goals.className = "card"; goals.dataset.in = "goals";
            goals.innerHTML = `<div class="card-header"><div><h3>Savings goals</h3><p>Track what you are saving towards.</p></div></div><button type="button" class="secondary-button" id="openGoals">Open goals</button>`;
            goals.querySelector("#openGoals").addEventListener("click", () => c.openGoals());
            extra.append(goals);

            const tabs = document.createElement("div");
            tabs.className = "insight-tabs"; tabs.setAttribute("role", "tablist");
            tabs.innerHTML = TABS.map(([k, label], i) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${i === 0}">${label}</button>`).join("");
            tabs.addEventListener("click", e => {
                const b = e.target.closest("[data-tab]"); if (!b) return;
                reports.dataset.tab = b.dataset.tab;
                tabs.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
            });
            reports.dataset.tab = "overview";
            (reports.querySelector(".section-heading") || reports.firstElementChild).after(tabs);
        }
    }

    // ---- frequent payees: the shops and people you pay again and again ----
    let payeeList = [];
    const clean = d => String(d || "").replace(/^(paid to|sent to|m-pesa fee)\s*/i, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    function payees() {
        const map = new Map();
        for (const t of getAll()) {
            if (t.type !== "expense" || /^M-Pesa fee/i.test(t.description) || t.category === "Fees & Charges") continue;
            const key = clean(t.description).toLowerCase();
            if (!key) continue;
            const e = map.get(key) || { key, n: 0, last: null };
            e.n++;
            if (!e.last || t.date >= e.last.date) e.last = t;
            map.set(key, e);
        }
        return [...map.values()].filter(e => e.n >= 2).sort((a, b) => b.n - a.n || b.last.date.localeCompare(a.last.date)).slice(0, 8)
            .map(e => ({ label: clean(e.last.description), description: e.last.description, amount: e.last.amount, category: e.last.category, n: e.n }));
    }
    const initials = s => (s.match(/[A-Za-z0-9]+/g) || ["?"]).slice(0, 2).map(w => w[0]).join("").toUpperCase();

    function renderPayees() {
        const box = $("payees"); if (!box) return;
        payeeList = payees();
        box.hidden = !payeeList.length;
        $("payeeRow").innerHTML = payeeList.map((p, i) => `
            <button type="button" class="payee" data-payee="${i}" title="Add ${escapeHTML(p.label)} again (${escapeHTML(String(p.n))} times so far)">
                <span class="payee-av" style="--c:${colorFor(p.category)}">${escapeHTML(initials(p.label))}</span>
                <span class="payee-name">${escapeHTML(p.label.split(" ")[0].slice(0, 11))}</span>
            </button>`).join("");
    }

    // ---- "vs last month" chip on the hero card ----
    function renderChip() {
        const card = document.querySelector(".balance-card"); if (!card) return;
        let chip = card.querySelector(".hero-chip");
        const month = getMonth();
        if (month === "all") { chip && chip.remove(); return; }
        const cur = totalsFor(inMonth(month)).expenses, prev = totalsFor(inMonth(shiftMonth(month, -1))).expenses;
        if (!prev) { chip && chip.remove(); return; }
        const pct = Math.round(((cur - prev) / prev) * 100);
        if (!chip) { chip = document.createElement("span"); chip.className = "hero-chip"; card.querySelector(".spark") ? card.insertBefore(chip, card.querySelector(".spark")) : card.append(chip); }
        chip.classList.toggle("good", pct <= 0);
        chip.textContent = pct === 0 ? `Spending the same as ${monthLabel(shiftMonth(month, -1))}` : `${pct < 0 ? "▼" : "▲"} ${Math.abs(pct)}% spending vs ${monthLabel(shiftMonth(month, -1))}`;
    }

    function renderIncomeDonut() {
        const box = $("incomeDonut"); if (!box) return;
        const by = {};
        for (const t of c.getVisible()) if (t.type === "income") by[t.category] = (by[t.category] || 0) + Number(t.amount);
        const entries = Object.entries(by).sort((a, b) => b[1] - a[1]);
        box.innerHTML = entries.length ? donutHTML(entries, formatCurrency) : '<p class="empty-note">No income recorded for this period.</p>';
        const label = [...box.querySelectorAll("*")].find(e => !e.children.length && e.textContent.trim() === "Spent");
        if (label) label.textContent = "Earned";
    }

    return { render() { if (!built) build(); renderPayees(); renderChip(); renderIncomeDonut(); } };
}
