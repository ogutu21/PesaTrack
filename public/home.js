// Home extras: avatar, "vs last month" chip, quick action buttons, frequent payees, and Insights tabs on Reports.
// Everything here is added to the page by script, and render() is safe to call on every refresh.
import { donutHTML } from "./charts.js";

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
    add: svg('<path d="M12 5v14M5 12h14"/>'),
    income: svg('<path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/>'),
    import: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    report: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>')
};
const ACTIONS = [["add", "Add expense"], ["income", "Add income"], ["import", "Import"], ["report", "Report"]];
const TABS = [["overview", "Overview"], ["income", "Income"], ["expenses", "Expenses"], ["goals", "Goals"]];

// which Reports cards belong to which tab (space separated)
const CARD_TABS = { overview: "overview income", spend: "expenses", donut: "expenses", budgets: "expenses goals", compare: "overview", trend: "overview income", income: "income", goals: "goals" };

export function initHome(c) {
    const { $, escapeHTML, formatCurrency } = c;
    let payees = [];

    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    // ---- avatar in the top bar ----
    function avatar() {
        const bar = document.querySelector(".topbar-actions");
        if (!bar) return;
        let a = $("avatarButton");
        if (!a) {
            a = el("button", "avatar"); a.id = "avatarButton"; a.type = "button"; a.setAttribute("aria-label", "Open settings");
            bar.prepend(a);
        }
        const name = ($("userName")?.textContent || "").trim();
        a.textContent = (name && name !== "PesaTrack User" ? name[0] : "P").toUpperCase();
    }

    // ---- hero chip: spending compared with the month before ----
    function heroChip() {
        const card = $("balanceAmount")?.closest(".summary-card");
        if (!card) return;
        let chip = card.querySelector(".hero-chip");
        const month = c.getMonth();
        const prevKey = month === "all" ? null : c.shiftMonth(month, -1);
        const cur = prevKey ? c.totalsFor(c.inMonth(month)).expenses : 0;
        const prev = prevKey ? c.totalsFor(c.inMonth(prevKey)).expenses : 0;
        if (!prevKey || !(prev > 0)) { chip?.remove(); return; }
        if (!chip) { chip = el("div", "hero-chip"); card.insertBefore(chip, card.querySelector(".spark")); }
        const pct = Math.round(((cur - prev) / prev) * 100);
        const good = pct <= 0;
        chip.className = "hero-chip " + (good ? "good" : "bad");
        chip.textContent = `${pct === 0 ? "■" : good ? "▼" : "▲"} ${Math.abs(pct)}% spending vs ${c.monthLabel(prevKey).split(" ")[0]}`;
    }

    // ---- round quick-action buttons ----
    function actions() {
        if ($("quickActions")) return;
        const grid = document.querySelector("#dashboard .summary-grid");
        if (!grid) return;
        const box = el("div", "quick-actions", ACTIONS.map(([k, label]) =>
            `<button type="button" class="qa" data-qa="${k}"><span class="qa-icon">${ICONS[k]}</span><span>${label}</span></button>`).join(""));
        box.id = "quickActions";
        grid.after(box);
    }

    // ---- frequent payees: what you pay most, one tap to add again ----
    const clean = d => String(d || "").replace(/^(Sent to|Paid to|Received from)\s+/i, "").trim();
    function computePayees() {
        const since = new Date(); since.setDate(since.getDate() - 150);
        const cutoff = since.toISOString().slice(0, 10);
        const map = new Map();
        for (const t of c.getAll()) {
            if (t.type !== "expense" || (t.date || "") < cutoff || t.category === "Fees & Charges") continue;
            const name = clean(t.description);
            if (!name || /^(m-pesa|airtime|data bundles)/i.test(name)) continue;
            const key = name.toLowerCase();
            const e = map.get(key) || { name, n: 0, last: "", amount: 0, category: "", description: "" };
            e.n++;
            if ((t.date || "") >= e.last) Object.assign(e, { last: t.date || "", amount: Number(t.amount), category: t.category, description: t.description });
            map.set(key, e);
        }
        return [...map.values()].filter(e => e.n >= 2).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 8);
    }
    function payeeRow() {
        payees = computePayees();
        let box = $("payees");
        if (!payees.length) { box?.remove(); return; }
        if (!box) {
            box = el("section", "payees"); box.id = "payees"; box.setAttribute("aria-label", "Frequent payees");
            ($("quickActions") || document.querySelector("#dashboard .summary-grid")).after(box);
        }
        box.innerHTML = `<h3 class="row-title">Pay again</h3><div class="payee-scroll">${payees.map((p, i) => `
            <button type="button" class="payee" data-p="${i}" title="${escapeHTML(p.name)}, ${escapeHTML(formatCurrency(p.amount))}">
                <span class="payee-av" style="--c:${c.colorFor(p.category)}">${escapeHTML(initials(p.name))}</span>
                <span class="payee-name">${escapeHTML(p.name)}</span>
            </button>`).join("")}</div>`;
    }
    const initials = n => { const w = n.split(/\s+/).filter(Boolean); return ((w[0]?.[0] || "?") + (w.length > 1 ? w[1][0] : "")).toUpperCase(); };

    // ---- Reports: Insights tabs ----
    function insights() {
        const rep = $("reports");
        if (!rep || !rep.querySelector(".reports-grid")) return;
        if (!$("insightTabs")) {
            const tabs = el("div", "tabs insight-tabs", TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-t="${k}">${l}</button>`).join(""));
            tabs.id = "insightTabs"; tabs.setAttribute("role", "tablist");
            rep.querySelector(".reports-grid").before(tabs);
            rep.dataset.tab = "overview";
            // two cards that only exist here
            const extra = rep.querySelector(".reports-extra");
            extra.append(
                el("div", "card", `<div class="card-header"><div><h3>Income sources</h3><p>Where your money came from.</p></div></div><div id="incomeDonut"></div>`),
                el("div", "card", `<div class="card-header"><div><h3>Savings goals</h3><p>Money you're setting aside.</p></div></div><p class="mp-note">Your goals live on the dashboard, under “At a glance”.</p><button type="button" class="secondary-button" data-go-goals>Open goals</button>`)
            );
            const cards = { spend: "categoryChart", donut: "donutChart", budgets: "budgetList", compare: "comparisonCard", trend: "trendChart", income: "incomeDonut" };
            for (const [k, id] of Object.entries(cards)) $(id)?.closest(".card")?.setAttribute("data-k", CARD_TABS[k]);
            $("reportIncome")?.closest(".card")?.setAttribute("data-k", CARD_TABS.overview);
            extra.lastElementChild.setAttribute("data-k", CARD_TABS.goals);
        }
        const cur = rep.dataset.tab || "overview";
        $("insightTabs").querySelectorAll(".tab").forEach(b => { const on = b.dataset.t === cur; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });

        // income by category
        const by = {};
        for (const t of c.getVisible()) if (t.type === "income") by[t.category] = (by[t.category] || 0) + Number(t.amount);
        const entries = Object.entries(by).sort((a, b) => b[1] - a[1]);
        const box = $("incomeDonut");
        if (box) box.innerHTML = entries.length ? donutHTML(entries, formatCurrency, "Earned") : `<p class="mp-note">No income recorded for this period.</p>`;
    }

    document.addEventListener("click", e => {
        const t = e.target.closest("[data-qa], .payee, #insightTabs .tab, #avatarButton, [data-go-goals]");
        if (!t) return;
        if (t.dataset.qa === "add") c.addTx("expense");
        else if (t.dataset.qa === "income") c.addTx("income");
        else if (t.dataset.qa === "import") (document.querySelector("[data-open-statement]") || document.querySelector("[data-open-mpesa]"))?.click();
        else if (t.dataset.qa === "report") document.querySelector("[data-open-report]")?.click();
        else if (t.classList.contains("payee")) { const p = payees[Number(t.dataset.p)]; if (p) c.addTx("expense", { description: p.description, amount: p.amount, category: p.category }); }
        else if (t.dataset.t) { $("reports").dataset.tab = t.dataset.t; insights(); }
        else if (t.id === "avatarButton") c.go("settings");
        else if (t.hasAttribute("data-go-goals")) c.go("goals");
    });

    return { render() { avatar(); heroChip(); actions(); payeeRow(); insights(); } };
}
