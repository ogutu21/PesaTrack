// Dashboard widgets, savings goals and recurring transactions.
// script.js passes in what this module needs (state getters + UI helpers) via initFeatures(ctx).
import { subscribeItems, saveItems } from "./firestore.js";
import { trendHTML } from "./charts.js";
import { occurrences, nextOccurrence, daysIn } from "./recurrence.js";
import { setCustomCategories, getCustomCategories, categoryExists, EMOJI_CHOICES } from "./categories.js";

const WIDGETS = [
    ["insights", "Insights (daily average, biggest expense, forecast)"],
    ["budgets", "Budget progress"],
    ["categories", "Top spending categories"],
    ["trend", "6-month trend"],
    ["goals", "Savings goals"]
];
const PREFS_KEY = "pesatrack_widgets";
const FREQ = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
const sum = (list, f = x => x) => list.reduce((s, x) => s + Number(f(x)), 0);

export function initFeatures(c) {
    const esc = c.escapeHTML;
    let goals = [], recurring = [];
    const loaded = { goals: false, recurring: false };
    let unsubs = [], posting = false;
    const attempted = new Set();   // schedule+date combos already sent this session

    // ---------- preferences ----------
    function prefs() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { /* ignore */ }
        return Object.fromEntries(WIDGETS.map(([id]) => [id, saved[id] !== false]));
    }

    // ---------- generic form / list modals ----------
    function openForm({ title, note, fields, submit = "Save", onSubmit }) {
        const input = f => f.type === "select"
            ? `<select name="${f.name}" ${f.disabled ? "disabled" : ""}>${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`
            : `<input name="${f.name}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""} ${f.min !== undefined ? `min="${f.min}"` : ""}
                 value="${esc(f.value ?? "")}" ${f.required ? "required" : ""} ${f.disabled ? "disabled" : ""} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}>`;
        const { overlay, close } = c.openOverlay(`
            <h3>${esc(title)}</h3>${note ? `<p class="confirm-text">${esc(note)}</p>` : ""}
            <form>${fields.map(f => `<div class="form-group"><label>${esc(f.label)}</label>${input(f)}</div>`).join("")}
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-close>Cancel</button>
                    <button type="submit" class="primary-button">${esc(submit)}</button>
                </div>
            </form>`);
        overlay.querySelector("form").addEventListener("submit", e => {
            e.preventDefault();
            const values = Object.fromEntries(fields.map(f => [f.name, e.target.elements[f.name].value]));
            if (onSubmit(values) !== false) close();
        });
        return { overlay, close };
    }

    function openManager({ title, items, describe, addLabel, onAdd, onEdit, onDelete, empty }) {
        const { overlay, close } = c.openOverlay(`
            <h3>${esc(title)}</h3>
            <div class="mp-list">${items.length ? items.map((it, i) => {
                const d = describe(it);
                return `<div class="mp-row mg-row"><div class="mp-main"><strong>${esc(d.title)}</strong><small>${esc(d.sub)}</small></div>
                    <button type="button" class="secondary-button" data-edit="${i}">Edit</button>
                    <button type="button" class="secondary-button" data-del="${i}">Delete</button></div>`;
            }).join("") : c.emptyState("📭", "Nothing here yet", empty)}</div>
            <div class="modal-actions">
                <button type="button" class="secondary-button" data-close>Close</button>
                <button type="button" class="primary-button" data-add>${esc(addLabel)}</button>
            </div>`, true);
        overlay.addEventListener("click", async e => {
            const t = e.target;
            if (t.matches("[data-add]")) { close(); onAdd(); }
            if (t.dataset.edit !== undefined) { close(); onEdit(items[t.dataset.edit]); }
            if (t.dataset.del !== undefined && await c.confirmDialog(`Delete “${describe(items[t.dataset.del]).title}”?`)) {
                close(); onDelete(items[t.dataset.del]);
            }
        });
    }

    const persist = (name, items) => saveItems(c.getUser().uid, name, items).catch(c.reportWriteError);

    // =====================================================
    // CUSTOM CATEGORIES
    // =====================================================
    function categoryForm(cat) {
        const isNew = !cat;
        openForm({
            title: isNew ? "New category" : "Edit category",
            note: isNew ? "Your own categories appear next to the built-in ones." : "To rename a category, delete it and add it again.",
            fields: [
                { name: "name", label: "Name", value: cat?.name, required: true, placeholder: "e.g. Coffee", disabled: !isNew },
                { name: "type", label: "Type", type: "select", value: cat?.type || "expense", disabled: !isNew,
                    options: [{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }] },
                { name: "icon", label: "Icon", type: "select", value: cat?.icon || EMOJI_CHOICES[0], options: EMOJI_CHOICES.map(e => ({ value: e, label: e })) }
            ],
            onSubmit: v => {
                const name = (cat?.name || v.name).trim().slice(0, 24);
                if (!name) { c.toast("Please enter a name.", "error"); return false; }
                if (isNew && categoryExists(name)) { c.toast("A category with that name already exists.", "error"); return false; }
                const next = { id: cat?.id || c.newId(), name, icon: v.icon, type: cat?.type || v.type };
                const list = getCustomCategories();
                persist("categories", isNew ? [...list, next] : list.map(x => (x.id === cat.id ? next : x)));
                c.toast(isNew ? "Category added" : "Category updated", "success");
            }
        });
    }

    const manageCategories = () => openManager({
        title: "My categories", items: getCustomCategories(), addLabel: "+ New category", empty: "Add categories like Coffee, Boda or Church.",
        describe: x => ({ title: `${x.icon} ${x.name}`, sub: x.type === "income" ? "Income" : "Expense" }),
        onAdd: () => categoryForm(), onEdit: categoryForm,
        onDelete: x => { persist("categories", getCustomCategories().filter(y => y.id !== x.id)); c.toast("Category deleted. Existing transactions keep their label.", "success"); }
    });

    // =====================================================
    // SAVINGS GOALS
    // =====================================================
    function goalForm(goal) {
        const isNew = !goal;
        openForm({
            title: isNew ? "New savings goal" : "Edit goal",
            fields: [
                { name: "name", label: "Goal name", value: goal?.name, required: true, placeholder: "e.g. Emergency fund" },
                { name: "target", label: "Target amount (KES)", type: "number", step: "0.01", min: 1, value: goal?.target, required: true },
                { name: "saved", label: "Saved so far (KES)", type: "number", step: "0.01", min: 0, value: goal?.saved ?? 0 },
                { name: "deadline", label: "Target date (optional)", type: "date", value: goal?.deadline || "" }
            ],
            onSubmit: v => {
                const target = Math.round(Number(v.target) * 100) / 100;
                if (!v.name.trim() || !(target > 0)) { c.toast("Enter a name and a target amount.", "error"); return false; }
                const next = { id: goal?.id || c.newId(), name: v.name.trim().slice(0, 60), target,
                    saved: Math.max(0, Math.round(Number(v.saved || 0) * 100) / 100), deadline: v.deadline || "" };
                persist("goals", isNew ? [...goals, next] : goals.map(g => (g.id === goal.id ? next : g)));
                c.toast(isNew ? "Goal added" : "Goal updated", "success");
            }
        });
    }

    function contribute(goal) {
        openForm({
            title: `Add money to “${goal.name}”`,
            note: `${c.formatCurrency(goal.saved)} saved of ${c.formatCurrency(goal.target)}.`,
            submit: "Add",
            fields: [{ name: "amount", label: "Amount (KES)", type: "number", step: "0.01", min: 0.01, required: true }],
            onSubmit: v => {
                const add = Math.round(Number(v.amount) * 100) / 100;
                if (!(add > 0)) return false;
                const saved = Math.round((goal.saved + add) * 100) / 100;
                persist("goals", goals.map(g => (g.id === goal.id ? { ...g, saved } : g)));
                c.toast(saved >= goal.target ? `🎉 “${goal.name}” is fully funded!` : "Money added", "success");
            }
        });
    }

    const manageGoals = () => openManager({
        title: "Savings goals", items: goals, addLabel: "+ New goal", empty: "Create a goal to start saving towards it.",
        describe: g => ({ title: g.name, sub: `${c.formatCurrency(g.saved)} of ${c.formatCurrency(g.target)}${g.deadline ? ` · by ${c.formatDate(g.deadline)}` : ""}` }),
        onAdd: () => goalForm(), onEdit: goalForm,
        onDelete: g => { persist("goals", goals.filter(x => x.id !== g.id)); c.toast("Goal deleted", "success"); }
    });

    function goalsHTML() {
        if (!goals.length) return c.emptyState("🎯", "No goals yet", "Add a goal, like an emergency fund or a new phone.");
        const today = c.localToday();
        return `<div class="budget-list">${goals.map(g => {
            const pct = Math.min((g.saved / g.target) * 100, 100);
            const left = Math.max(g.target - g.saved, 0);
            let hint = left === 0 ? "🎉 Goal reached" : `${c.formatCurrency(left)} to go`;
            if (left > 0 && g.deadline) {
                if (g.deadline <= today) hint += " · deadline passed";
                else {
                    const months = Math.max(1, Math.ceil((new Date(g.deadline) - new Date(today)) / (30.4 * 864e5)));
                    hint += ` · save ${c.formatCurrency(left / months)}/month to finish by ${c.formatDate(g.deadline)}`;
                }
            }
            return `<div class="budget-row ${left === 0 ? "ok" : "goal"}">
                <div class="budget-top"><span>${left === 0 ? "✅" : "🎯"} ${esc(g.name)}</span><span>${c.formatCurrency(g.saved)} of ${c.formatCurrency(g.target)}</span></div>
                <div class="progress"><div class="progress-bar" style="width:${pct.toFixed(1)}%"></div></div>
                <div class="budget-note">${esc(hint)}</div>
                ${left > 0 ? `<button type="button" class="secondary-button goal-btn" data-act="contribute" data-id="${esc(g.id)}">＋ Add money</button>` : ""}
            </div>`;
        }).join("")}</div>`;
    }

    // =====================================================
    // RECURRING TRANSACTIONS
    // =====================================================
    function recurringForm(r) {
        const isNew = !r;
        const catOpts = type => c.categoriesFor(type).map(x => ({ value: x.name, label: `${c.getCategoryIcon(x.name)} ${x.name}` }));
        const { overlay } = openForm({
            title: isNew ? "New recurring transaction" : "Edit recurring transaction",
            note: isNew ? "It's added automatically each time it falls due. If the start date is in the past, missed entries (up to 24) are added too." : "",
            fields: [
                { name: "description", label: "Description", value: r?.description, required: true, placeholder: "e.g. Rent" },
                { name: "amount", label: "Amount (KES)", type: "number", step: "0.01", min: 0.01, value: r?.amount, required: true },
                { name: "type", label: "Type", type: "select", value: r?.type || "expense", options: [{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }] },
                { name: "category", label: "Category", type: "select", value: r?.category || "Bills", options: catOpts(r?.type || "expense") },
                { name: "frequency", label: "Repeats", type: "select", value: r?.frequency || "monthly", options: Object.entries(FREQ).map(([value, label]) => ({ value, label })) },
                { name: "startDate", label: "First date", type: "date", value: r?.startDate || c.localToday(), required: true },
                { name: "active", label: "Status", type: "select", value: r?.active === false ? "no" : "yes", options: [{ value: "yes", label: "Active" }, { value: "no", label: "Paused" }] }
            ],
            onSubmit: v => {
                const amount = Math.round(Number(v.amount) * 100) / 100;
                if (!v.description.trim() || !(amount > 0) || !v.startDate) { c.toast("Please fill in the description, amount and date.", "error"); return false; }
                const next = { id: r?.id || c.newId(), description: v.description.trim().slice(0, 100), amount, type: v.type,
                    category: v.category, frequency: v.frequency, startDate: v.startDate, active: v.active !== "no",
                    // keep progress if the schedule is unchanged, otherwise start fresh
                    lastPosted: r && r.startDate === v.startDate && r.frequency === v.frequency ? r.lastPosted || null : null };
                persist("recurring", isNew ? [...recurring, next] : recurring.map(x => (x.id === r.id ? next : x)));
                c.toast(isNew ? "Recurring transaction added" : "Updated", "success");
            }
        });
        const typeSel = overlay.querySelector("[name=type]"), catSel = overlay.querySelector("[name=category]");
        typeSel.addEventListener("change", () => c.fillSelect(catSel, typeSel.value, ""));
    }

    const manageRecurring = () => openManager({
        title: "Recurring transactions", items: recurring, addLabel: "+ New recurring", empty: "Add rent, salary or subscriptions so they record themselves.",
        describe: r => ({ title: r.description, sub: `${FREQ[r.frequency] || ""} · ${r.type === "income" ? "+" : "-"}${c.formatCurrency(r.amount)} · ${r.active === false ? "Paused" : `next ${c.formatDate(nextOccurrence(r, c.localToday()))}`}` }),
        onAdd: () => recurringForm(), onEdit: recurringForm,
        onDelete: r => { persist("recurring", recurring.filter(x => x.id !== r.id)); c.toast("Deleted. Past transactions were kept.", "success"); }
    });

    // Adds every due occurrence, then remembers the last date posted so deleted entries stay deleted.
    async function postDue() {
        const user = c.getUser();
        if (!user || !loaded.recurring || posting) return;
        const today = c.localToday(), txs = [];
        const next = recurring.map(r => {
            if (r.active === false) return r;
            const dates = occurrences(r, r.lastPosted || null, today).slice(-24);
            if (!dates.length || attempted.has(`${r.id}:${dates[dates.length - 1]}`)) return r;
            attempted.add(`${r.id}:${dates[dates.length - 1]}`);
            dates.forEach(date => txs.push({ id: `rec-${r.id}-${date}`, description: r.description, amount: r.amount,
                type: r.type, category: r.category, date, createdAt: new Date().toISOString() }));
            return { ...r, lastPosted: dates[dates.length - 1] };
        });
        if (!txs.length) return;
        posting = true;
        try {
            await c.importTransactions(user.uid, txs);
            await saveItems(user.uid, "recurring", next);
            c.toast(`Added ${txs.length} recurring transaction${txs.length === 1 ? "" : "s"}`, "success");
        } catch (e) { console.error("Recurring post failed:", e); attempted.clear(); }
        finally { posting = false; }
    }

    function upcomingHTML() {
        const today = c.localToday();
        const list = recurring.filter(r => r.active !== false)
            .map(r => ({ r, next: nextOccurrence(r, today) })).filter(x => x.next).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 5);
        if (!list.length) return c.emptyState("🔁", "Nothing scheduled", "Add rent, salary or subscriptions and they record themselves.");
        return `<div class="transaction-list">${list.map(({ r, next }) => `
            <div class="transaction-item">
                <div class="transaction-left"><div class="transaction-icon">${c.getCategoryIcon(r.category)}</div>
                    <div class="transaction-info"><h4>${esc(r.description)}</h4><p>${esc(FREQ[r.frequency])} · next ${c.formatDate(next)}</p></div></div>
                <div class="transaction-right"><div class="transaction-amount ${r.type}">${r.type === "income" ? "+" : "-"}${c.formatCurrency(r.amount)}</div></div>
            </div>`).join("")}</div>`;
    }

    // =====================================================
    // DASHBOARD WIDGETS
    // =====================================================
    function insightsHTML() {
        const list = c.getVisible(), exp = list.filter(t => t.type === "expense");
        const spent = sum(exp, t => t.amount), income = sum(list.filter(t => t.type === "income"), t => t.amount);
        const today = c.localToday(), cur = today.slice(0, 7), month = c.getMonth();
        let days = 1, dim = 0;
        if (month === "all") {
            const first = list.map(t => t.date).sort()[0];
            days = first ? Math.max(1, Math.round((new Date(today) - new Date(first)) / 864e5) + 1) : 1;
        } else {
            const [y, m] = month.split("-").map(Number);
            dim = daysIn(y, m);
            days = month === cur ? Number(today.slice(8)) : dim;
        }
        const biggest = [...exp].sort((a, b) => b.amount - a.amount)[0];

        let fourth;
        const limits = Object.entries(c.getBudgets()).filter(([, l]) => l > 0);
        if (month === cur && limits.length) {
            const spentBy = c.spentByCategory(cur);
            const remaining = sum(limits, ([, l]) => l) - sum(limits, ([cat]) => spentBy[cat] || 0);
            const left = dim - Number(today.slice(8)) + 1;
            fourth = ["Safe to spend today", remaining > 0 ? c.formatCurrency(remaining / left) : "Over budget",
                `${c.formatCurrency(Math.max(remaining, 0))} of budgets left`];
        } else if (month === cur) {
            fourth = ["Projected month spend", c.formatCurrency((spent / days) * dim), "if you keep this pace"];
        } else {
            fourth = ["Net for period", c.formatCurrency(income - spent), "income minus expenses"];
        }
        const tile = ([label, value, sub]) => `<div class="stat-tile"><small>${label}</small><strong>${value}</strong><span>${sub}</span></div>`;
        return `<div class="stat-tiles">${[
            ["Average per day", c.formatCurrency(spent / days), `over ${days} day${days === 1 ? "" : "s"}`],
            ["Biggest expense", biggest ? c.formatCurrency(biggest.amount) : "—", biggest ? esc(biggest.description) : "No expenses yet"],
            ["Transactions", String(list.length), list.length ? `${exp.length} expense${exp.length === 1 ? "" : "s"}` : "None yet"],
            fourth
        ].map(tile).join("")}</div>`;
    }

    function budgetsHTML() {
        const key = c.budgetMonth(), spent = c.spentByCategory(key);
        const rows = Object.entries(c.getBudgets()).filter(([, l]) => l > 0).slice(0, 5);
        if (!rows.length) return c.emptyState("🎯", "No budgets yet", "Set limits under Reports → Edit budgets.");
        return `<div class="budget-list">${rows.map(([cat, limit]) => {
            const s = spent[cat] || 0, pct = (s / limit) * 100, level = pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
            return `<div class="budget-row ${level}"><div class="budget-top"><span><i class="cat-dot" style="background:${c.colorFor(cat)}"></i>${c.getCategoryIcon(cat)} ${esc(cat)}</span><span>${pct.toFixed(0)}%</span></div>
                <div class="progress"><div class="progress-bar" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
                <div class="budget-note">${c.formatCurrency(s)} of ${c.formatCurrency(limit)}</div></div>`;
        }).join("")}</div>`;
    }

    function categoriesHTML() {
        const by = {};
        c.getVisible().filter(t => t.type === "expense").forEach(t => { by[t.category] = (by[t.category] || 0) + Number(t.amount); });
        const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5), total = sum(Object.values(by));
        if (!rows.length) return c.emptyState("📊", "No expenses yet", "Your top categories will show here.");
        return rows.map(([cat, amt]) => `<div class="category-row"><span class="category-name">${c.getCategoryIcon(cat)} ${esc(cat)}</span>
            <div class="progress"><div class="progress-bar" style="width:${((amt / total) * 100).toFixed(1)}%"></div></div>
            <span class="category-value">${c.formatCurrency(amt)}</span></div>`).join("");
    }

    function trendWidgetHTML() {
        const base = c.budgetMonth(), months = [];
        for (let i = 5; i >= 0; i--) {
            const key = c.shiftMonth(base, -i), t = c.totalsFor(c.inMonth(key)), [y, m] = key.split("-").map(Number);
            months.push({ label: new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "short" }), income: t.income, expense: t.expenses });
        }
        const fmt = v => new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 }).format(v);
        const small = trendHTML(months, fmt);
        if (!small) return c.emptyState("📈", "No data yet", "Add transactions to see your trend.");
        // wide version for desktop, compact version for phones (CSS picks one)
        return `<div class="trend-sm">${small}</div><div class="trend-lg">${trendHTML(months, fmt, 900, 230)}</div>`;
    }

    function render() {
        const box = c.$("dashWidgets");
        if (!box) return;
        const on = prefs();
        const card = (id, title, sub, body, { wide = false, action = "" } = {}) => on[id] ? `
            <div class="card widget ${wide ? "widget-wide" : ""}">
                <div class="card-header"><div><h3>${title}</h3><p>${sub}</p></div>${action}</div>${body}
            </div>` : "";
        box.innerHTML = [
            card("insights", "Insights", c.getMonth() === "all" ? "Across all your data" : "For the selected month", insightsHTML(), { wide: true }),
            card("budgets", "Budgets", "Month to date", budgetsHTML()),
            card("categories", "Top spending", "Biggest categories", categoriesHTML()),
            card("goals", "Savings goals", "Money you're setting aside", goalsHTML(), { action: `<button type="button" class="secondary-button" data-act="addGoal">+ Goal</button>` }),
            card("trend", "Last 6 months", "Income versus expenses", trendWidgetHTML(), { wide: true })
        ].join("") || c.emptyState("🧩", "All cards are hidden", "Tap Customize to choose what to show.");
        postDue();
        c.afterRender?.();
    }

    function customize() {
        const on = prefs();
        const { overlay, close } = c.openOverlay(`
            <h3>Customize dashboard</h3>
            <p class="confirm-text">Choose the cards you want to see.</p>
            <div class="mp-list">${WIDGETS.map(([id, label]) =>
                `<label class="mp-fee"><input type="checkbox" data-w="${id}" ${on[id] ? "checked" : ""}> ${esc(label)}</label>`).join("")}</div>
            <div class="modal-actions"><button type="button" class="primary-button" data-close>Done</button></div>`);
        overlay.addEventListener("change", e => {
            if (!e.target.dataset.w) return;
            const next = prefs(); next[e.target.dataset.w] = e.target.checked;
            localStorage.setItem(PREFS_KEY, JSON.stringify(next));
            render();
        });
    }

    // ---------- wiring ----------
    c.$("dashWidgets").addEventListener("click", e => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        if (b.dataset.act === "addGoal") goalForm();
        if (b.dataset.act === "manageRecurring") manageRecurring();
        if (b.dataset.act === "contribute") { const g = goals.find(x => x.id === b.dataset.id); if (g) contribute(g); }
    });
    c.$("customizeWidgets").addEventListener("click", customize);
    c.$("manageGoals").addEventListener("click", manageGoals);
    c.$("manageRecurring").addEventListener("click", manageRecurring);
    c.$("manageCategories").addEventListener("click", manageCategories);

    return {
        render, upcomingHTML, manageRecurring,
        start(uid) {
            loaded.goals = loaded.recurring = false;
            unsubs = [
                subscribeItems(uid, "goals", items => { goals = items; loaded.goals = true; render(); }, e => console.error("Goals sync error:", e)),
                subscribeItems(uid, "categories", items => { setCustomCategories(items); c.onCategoriesChanged(); }, e => console.error("Categories sync error:", e)),
                subscribeItems(uid, "recurring", items => { recurring = items; loaded.recurring = true; render(); }, e => console.error("Recurring sync error:", e))
            ];
        },
        getData: () => ({ goals, recurring, categories: getCustomCategories() }),
        stop() { unsubs.forEach(u => u()); unsubs = []; goals = []; recurring = []; setCustomCategories([]); }
    };
}
