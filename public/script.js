// =====================================================
// PESATRACK APP LOGIC (Firestore-backed, offline-capable)
// =====================================================
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    subscribeTransactions, saveTransaction, deleteTransaction,
    clearTransactions, importTransactions, subscribeBudgets, saveBudgets
} from "./firestore.js";
import { parseMpesa } from "./mpesa.js";
import { donutHTML, trendHTML } from "./charts.js";

let transactions = [];
let currentUser = null;
let unsubscribe = null;
let unsubscribeBudgets = null;
let budgets = {};                       // { Food: 5000, ... }
let selectedMonth = currentMonthKey();  // "YYYY-MM" or "all"
let monthDecided = false;               // true once the user (or first load) picked a view
let deferredInstallPrompt = null;

const $ = id => document.getElementById(id);
const pageSections = document.querySelectorAll(".page-section");
const navItems = document.querySelectorAll(".nav-item");
const mobileNavItems = document.querySelectorAll(".mobile-nav-item");
const sidebar = document.querySelector(".sidebar");
const dateInput = $("date");

// ---------- helpers ----------
function localToday() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; // local time, not UTC
}

const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 });
const formatCurrency = amount => money.format(amount);

function formatDate(s) {
    if (!s) return "";
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function escapeHTML(v) {
    return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function getCategoryIcon(c) {
    return ({ Food: "🍔", Transport: "🚗", Shopping: "🛍️", Bills: "🧾", Education: "📚",
        Entertainment: "🎮", Health: "❤️", Salary: "💼", Business: "🏢", Other: "💰" })[c] || "💰";
}

function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------- toast + confirm (replace alert/confirm) ----------
function toast(message, kind = "info") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = message;
    $("toastContainer").appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

function confirmDialog(message, confirmLabel = "Delete") {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true">
                <h3>Please confirm</h3>
                <p class="confirm-text">${escapeHTML(message)}</p>
                <div class="modal-actions confirm-actions">
                    <button type="button" class="secondary-button" data-r="0">Cancel</button>
                    <button type="button" class="danger-solid" data-r="1">${escapeHTML(confirmLabel)}</button>
                </div>
            </div>`;
        const done = value => { overlay.remove(); resolve(value); };
        overlay.addEventListener("click", e => {
            if (e.target === overlay) done(false);
            const b = e.target.closest("[data-r]");
            if (b) done(b.dataset.r === "1");
        });
        document.body.appendChild(overlay);
        overlay.querySelector("[data-r='0']").focus();
    });
}

function setSync(state) {
    const el = $("syncStatus");
    if (!el) return;
    el.className = `sync-status ${state}`;
    el.textContent = state === "online" ? "☁️ Synced" : state === "offline" ? "Offline — saved on device" : "Syncing…";
}
window.addEventListener("online", () => setSync("online"));
window.addEventListener("offline", () => setSync("offline"));

if (dateInput) dateInput.value = localToday();

// ---------- navigation ----------
function openSection(name) {
    pageSections.forEach(s => s.classList.remove("active"));
    $(name)?.classList.add("active");
    [...navItems, ...mobileNavItems].forEach(i => i.classList.toggle("active", i.dataset.section === name));
    $("pageTitle").textContent = ({ dashboard: "Dashboard", transactions: "Transactions",
        reports: "Reports", settings: "Settings" })[name] || "PesaTrack";
    $("monthBar").hidden = name === "settings";
    if (name === "settings") updateUserInformation();
    if (name === "reports") renderReports();
    sidebar.classList.remove("open");
}
[...navItems, ...mobileNavItems].forEach(i => i.addEventListener("click", () => openSection(i.dataset.section)));
document.querySelectorAll("[data-section-link]").forEach(b =>
    b.addEventListener("click", () => openSection(b.dataset.sectionLink)));
$("mobileMenuButton").addEventListener("click", () => sidebar.classList.toggle("open"));

// ---------- add transaction ----------
function reportWriteError(error) {
    console.error("Firestore write failed:", error);
    toast("Couldn't save to the cloud. Please try again.", "error");
}

$("transactionForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!currentUser) return;

    const description = $("description").value.trim();
    const amount = Math.round(Number($("amount").value) * 100) / 100;
    const date = $("date").value;

    if (!description || !(amount > 0) || !date) {
        toast("Please enter valid transaction details.", "error");
        return;
    }

    const tx = {
        id: newId(), description, amount, date,
        type: $("type").value, category: $("category").value,
        createdAt: new Date().toISOString()
    };

    const before = tx.type === "expense" ? (spentByCategory(monthKey(tx.date))[tx.category] || 0) : 0;
    saveTransaction(currentUser.uid, tx).catch(reportWriteError); // UI updates instantly via snapshot
    $("transactionForm").reset();
    dateInput.value = localToday();
    toast("Transaction added", "success");
    if (tx.type === "expense") budgetCheck(tx.category, before, before + tx.amount);
});

// ---------- totals + dashboard ----------
function totalsFor(list) {
    let income = 0, expenses = 0;
    list.forEach(t => (t.type === "income" ? (income += Number(t.amount)) : (expenses += Number(t.amount))));
    const balance = income - expenses;
    const savingsRate = income > 0 ? (balance / income) * 100 : 0; // can be negative (overspending)
    return { income, expenses, balance, savingsRate };
}
const calculateTotals = () => totalsFor(visible());

function savingsText(rate) {
    return `${rate.toFixed(1)}%`;
}

function updateDashboard() {
    const t = calculateTotals();
    $("balanceAmount").textContent = formatCurrency(t.balance);
    $("incomeAmount").textContent = formatCurrency(t.income);
    $("expenseAmount").textContent = formatCurrency(t.expenses);
    $("savingsRate").textContent = savingsText(t.savingsRate);
}

// ---------- transaction lists ----------
function transactionHTML(t) {
    const isIncome = t.type === "income";
    const id = escapeHTML(t.id);
    return `
        <div class="transaction-item" data-id="${id}">
            <div class="transaction-left">
                <div class="transaction-icon">${getCategoryIcon(t.category)}</div>
                <div class="transaction-info">
                    <h4>${escapeHTML(t.description)}</h4>
                    <p>${escapeHTML(t.category)} • ${formatDate(t.date)}</p>
                </div>
            </div>
            <div class="transaction-right">
                <div class="transaction-amount ${isIncome ? "income" : "expense"}">
                    ${isIncome ? "+" : "-"}${formatCurrency(Number(t.amount))}
                </div>
                <div class="transaction-actions">
                    <button data-action="edit" data-id="${id}">Edit</button>
                    <button data-action="delete" data-id="${id}">Delete</button>
                </div>
            </div>
        </div>`;
}

const emptyState = (icon, title, text) =>
    `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${text}</p></div>`;

function byNewest(a, b) {
    return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
}

function renderRecentTransactions() {
    const recent = [...visible()].sort(byNewest).slice(0, 5);
    $("recentTransactions").innerHTML = recent.length
        ? recent.map(transactionHTML).join("")
        : emptyState("💳", "No transactions yet", "Add your first transaction above.");
}

function renderTransactions() {
    const search = $("searchInput").value.trim().toLowerCase();
    const type = $("typeFilter").value;
    const category = $("categoryFilter").value;
    const sort = $("sortFilter").value;

    let list = visible().filter(t =>
        (!search || t.description.toLowerCase().includes(search) || t.category.toLowerCase().includes(search)) &&
        (type === "all" || t.type === type) &&
        (category === "all" || t.category === category));

    const sorters = {
        newest: byNewest,
        oldest: (a, b) => -byNewest(a, b),
        highest: (a, b) => Number(b.amount) - Number(a.amount),
        lowest: (a, b) => Number(a.amount) - Number(b.amount)
    };
    list.sort(sorters[sort] || byNewest);

    $("transactionList").innerHTML = list.length
        ? list.map(transactionHTML).join("")
        : emptyState("🔍", "No transactions found", "Try changing your search or filters.");
}

["searchInput"].forEach(id => $(id).addEventListener("input", renderTransactions));
["typeFilter", "categoryFilter", "sortFilter"].forEach(id => $(id).addEventListener("change", renderTransactions));

// ---------- edit / delete ----------
document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete") removeTransaction(button.dataset.id);
    if (button.dataset.action === "edit") openEditModal(button.dataset.id);
});

async function removeTransaction(id) {
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    if (!(await confirmDialog(`Delete "${t.description}"?`))) return;
    deleteTransaction(currentUser.uid, id).catch(reportWriteError);
    toast("Transaction deleted", "success");
}

async function clearAll() {
    if (transactions.length === 0) return toast("There are no transactions to clear.");
    if (!(await confirmDialog("Permanently delete ALL your transactions? This cannot be undone.", "Delete all"))) return;
    try {
        await clearTransactions(currentUser.uid);
        toast("All transactions deleted", "success");
    } catch (e) {
        reportWriteError(e);
    }
}
$("clearAllButton").addEventListener("click", clearAll);
$("settingsClearButton").addEventListener("click", clearAll);

const editModal = $("editModal");
function openEditModal(id) {
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    $("editId").value = t.id;
    $("editDescription").value = t.description;
    $("editAmount").value = t.amount;
    $("editType").value = t.type;
    $("editCategory").value = t.category;
    $("editDate").value = t.date;
    editModal.hidden = false;
}
const closeEditModal = () => { editModal.hidden = true; };
$("closeModal").addEventListener("click", closeEditModal);
$("cancelEdit").addEventListener("click", closeEditModal);
editModal.addEventListener("click", e => { if (e.target === editModal) closeEditModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !editModal.hidden) closeEditModal(); });

$("editTransactionForm").addEventListener("submit", event => {
    event.preventDefault();
    const original = transactions.find(x => x.id === $("editId").value);
    if (!original) return;

    const updated = {
        ...original,
        description: $("editDescription").value.trim(),
        amount: Math.round(Number($("editAmount").value) * 100) / 100,
        type: $("editType").value,
        category: $("editCategory").value,
        date: $("editDate").value
    };
    if (!updated.description || !(updated.amount > 0) || !updated.date) {
        return toast("Please enter valid transaction details.", "error");
    }
    saveTransaction(currentUser.uid, updated).catch(reportWriteError);
    closeEditModal();
    toast("Transaction updated", "success");
});

// ---------- reports ----------
function renderReports() {
    const t = calculateTotals();
    $("reportIncome").textContent = formatCurrency(t.income);
    $("reportExpenses").textContent = formatCurrency(t.expenses);
    $("reportBalance").textContent = formatCurrency(t.balance);
    $("reportSavings").textContent = savingsText(t.savingsRate);

    const categories = {};
    visible().filter(x => x.type === "expense").forEach(x => {
        categories[x.category] = (categories[x.category] || 0) + Number(x.amount);
    });
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const chart = $("categoryChart");

    if (!entries.length) {
        chart.innerHTML = emptyState("📊", "No report data yet", "Add expenses to see your report.");
        return;
    }
    const total = entries.reduce((s, [, v]) => s + v, 0);
    chart.innerHTML = entries.map(([category, amount]) => {
        const pct = (amount / total) * 100; // share of total spending
        return `
            <div class="category-row">
                <span class="category-name">${escapeHTML(category)}</span>
                <div class="progress"><div class="progress-bar" style="width:${pct.toFixed(1)}%"></div></div>
                <span class="category-value">${formatCurrency(amount)} · ${pct.toFixed(0)}%</span>
            </div>`;
    }).join("");
}

// ---------- theme ----------
function applyTheme() {
    const dark = localStorage.getItem("pesatrack_theme") === "dark";
    document.body.classList.toggle("dark", dark);
    $("themeButton").textContent = dark ? "☀️" : "🌙";
    $("settingsThemeButton").textContent = dark ? "☀️ Light Mode" : "🌙 Dark Mode";
}
function toggleTheme() {
    localStorage.setItem("pesatrack_theme", document.body.classList.contains("dark") ? "light" : "dark");
    applyTheme();
}
$("themeButton").addEventListener("click", toggleTheme);
$("settingsThemeButton").addEventListener("click", toggleTheme);


// =====================================================
// MONTH SCOPE
// =====================================================
function monthKey(date) { return (date || "").slice(0, 7); }
function currentMonthKey() { return localToday().slice(0, 7); }
function shiftMonth(key, delta) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}
const inMonth = key => transactions.filter(t => monthKey(t.date) === key);
function visible() { return selectedMonth === "all" ? transactions : inMonth(selectedMonth); }

function renderMonthBar() {
    const all = selectedMonth === "all";
    $("monthLabel").textContent = all ? "All time" : monthLabel(selectedMonth);
    $("prevMonth").disabled = all;
    $("nextMonth").disabled = all || selectedMonth >= currentMonthKey();
    $("allTimeButton").textContent = all ? "Back to month view" : "All time";
    $("allTimeButton").classList.toggle("active", all);
}
function setMonth(value) { monthDecided = true; selectedMonth = value; renderAll(); }
$("prevMonth").addEventListener("click", () => setMonth(shiftMonth(selectedMonth, -1)));
$("nextMonth").addEventListener("click", () => setMonth(shiftMonth(selectedMonth, 1)));
$("allTimeButton").addEventListener("click", () => setMonth(selectedMonth === "all" ? currentMonthKey() : "all"));

// =====================================================
// BUDGETS
// =====================================================
const INCOME_ONLY = ["Salary", "Business"];
const expenseCategories = () => [...$("category").options].map(o => o.value).filter(v => !INCOME_ONLY.includes(v));
const budgetMonth = () => (selectedMonth === "all" ? currentMonthKey() : selectedMonth);

function spentByCategory(key) {
    const out = {};
    inMonth(key).filter(t => t.type === "expense").forEach(t => {
        out[t.category] = (out[t.category] || 0) + Number(t.amount);
    });
    return out;
}
function budgetStatus(spent, limit) {
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    return { pct, level: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok" };
}
const activeBudgets = () => Object.entries(budgets).filter(([, limit]) => limit > 0);

function budgetCheck(category, before, after) {
    const limit = budgets[category];
    if (!(limit > 0)) return;
    if (before < limit && after >= limit) toast(`${category}: you're over your ${formatCurrency(limit)} budget`, "error");
    else if (before < limit * 0.8 && after >= limit * 0.8) toast(`${category}: 80% of your budget used`);
}

function renderBudgets() {
    const key = budgetMonth();
    const spent = spentByCategory(key);
    $("budgetPeriod").textContent = monthLabel(key);
    const rows = activeBudgets();
    $("budgetList").innerHTML = rows.length ? rows.map(([cat, limit]) => {
        const s = spent[cat] || 0;
        const { pct, level } = budgetStatus(s, limit);
        const left = limit - s;
        return `
            <div class="budget-row ${level}">
                <div class="budget-top">
                    <span>${getCategoryIcon(cat)} ${escapeHTML(cat)}</span>
                    <span>${formatCurrency(s)} of ${formatCurrency(limit)}</span>
                </div>
                <div class="progress"><div class="progress-bar" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
                <div class="budget-note">${left >= 0 ? `${formatCurrency(left)} left` : `${formatCurrency(-left)} over budget`} · ${pct.toFixed(0)}%</div>
            </div>`;
    }).join("") : emptyState("🎯", "No budgets yet", "Tap “Edit budgets” to set a monthly limit for a category.");
}

function renderBanner() {
    const spent = spentByCategory(budgetMonth());
    const alerts = activeBudgets()
        .map(([cat, limit]) => ({ cat, ...budgetStatus(spent[cat] || 0, limit) }))
        .filter(a => a.level !== "ok");
    const el = $("budgetBanner");
    el.hidden = !alerts.length;
    el.innerHTML = alerts.map(a => a.level === "over"
        ? `<span class="over">🚨 ${escapeHTML(a.cat)}: over budget (${a.pct.toFixed(0)}%)</span>`
        : `<span class="warn">⚠️ ${escapeHTML(a.cat)}: ${a.pct.toFixed(0)}% of budget used</span>`).join("");
}

function openOverlay(html, wide = false) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", e => {
        if (e.target === overlay || e.target.closest("[data-close]")) close();
    });
    document.body.appendChild(overlay);
    return { overlay, close };
}

function openBudgetEditor() {
    const cats = expenseCategories();
    const { overlay, close } = openOverlay(`
        <h3>Monthly budgets</h3>
        <p class="confirm-text">Set a monthly limit per category. Leave blank for no limit.</p>
        <form id="budgetForm">
            <div class="budget-form">
                ${cats.map((c, i) => `
                    <label><span>${getCategoryIcon(c)} ${escapeHTML(c)}</span>
                        <input type="number" min="0" step="0.01" inputmode="decimal" name="b${i}"
                               value="${budgets[c] || ""}" placeholder="No limit"></label>`).join("")}
            </div>
            <div class="modal-actions">
                <button type="button" class="secondary-button" data-close>Cancel</button>
                <button type="submit" class="primary-button">Save budgets</button>
            </div>
        </form>`);
    overlay.querySelector("#budgetForm").addEventListener("submit", e => {
        e.preventDefault();
        const limits = {};
        cats.forEach((c, i) => {
            const v = Math.round(Number(e.target.elements[`b${i}`].value) * 100) / 100;
            if (v > 0) limits[c] = v;
        });
        saveBudgets(currentUser.uid, limits).catch(reportWriteError);
        close();
        toast("Budgets saved", "success");
    });
}
$("editBudgetsButton").addEventListener("click", openBudgetEditor);

// =====================================================
// COMPARISON + CHARTS
// =====================================================
const compact = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 });

function deltaHTML(cur, prev, goodWhenUp) {
    if (!cur && !prev) return `<span class="delta flat">—</span>`;
    if (!prev) return `<span class="delta flat">New</span>`;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 0.5) return `<span class="delta flat">No change</span>`;
    const up = pct > 0;
    return `<span class="delta ${up === goodWhenUp ? "good" : "bad"}">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span>`;
}

function renderComparison() {
    const box = $("comparisonCard");
    if (selectedMonth === "all") {
        box.innerHTML = emptyState("📅", "Pick a month", "Switch to a month to compare it with the previous one.");
        return;
    }
    const cur = totalsFor(inMonth(selectedMonth));
    const prevKey = shiftMonth(selectedMonth, -1);
    const prev = totalsFor(inMonth(prevKey));
    const row = (label, c, p, goodUp) => `
        <div class="cmp-row">
            <div><strong>${label}</strong><small>${formatCurrency(c)} vs ${formatCurrency(p)} in ${monthLabel(prevKey)}</small></div>
            ${deltaHTML(c, p, goodUp)}
        </div>`;
    box.innerHTML = row("Income", cur.income, prev.income, true)
        + row("Expenses", cur.expenses, prev.expenses, false)
        + row("Net balance", cur.balance, prev.balance, true);
}

function renderCharts() {
    const spent = {};
    visible().filter(t => t.type === "expense").forEach(t => {
        spent[t.category] = (spent[t.category] || 0) + Number(t.amount);
    });
    const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    $("donutChart").innerHTML = entries.length
        ? donutHTML(entries, formatCurrency)
        : emptyState("🍩", "No expenses yet", "Your spending breakdown will appear here.");

    const base = budgetMonth();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const key = shiftMonth(base, -i);
        const totals = totalsFor(inMonth(key));
        const [y, m] = key.split("-").map(Number);
        months.push({ label: new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "short" }),
            income: totals.income, expense: totals.expenses });
    }
    const trend = trendHTML(months, v => compact.format(v));
    $("trendChart").innerHTML = trend || emptyState("📈", "No data yet", "Add transactions to see your monthly trend.");
}

// =====================================================
// CSV EXPORT
// =====================================================
function csvCell(value) {
    let v = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // stop spreadsheet formula injection
    return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function exportCSV() {
    const list = [...visible()].sort(byNewest);
    if (!list.length) return toast("No transactions to export for this period.");
    const rows = [["Date", "Description", "Type", "Category", "Amount (KES)"]]
        .concat(list.map(t => [t.date, t.description, t.type, t.category, Number(t.amount).toFixed(2)]));
    const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"); // BOM so Excel reads UTF-8
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `pesatrack-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast(`Exported ${list.length} transactions`, "success");
}
document.querySelectorAll("[data-export-csv]").forEach(b => b.addEventListener("click", exportCSV));

// =====================================================
// M-PESA IMPORT
// =====================================================
function openMpesaImport() {
    if (!currentUser) return;
    const { overlay, close } = openOverlay(`
        <h3>Import from M-Pesa</h3>
        <p class="confirm-text">Paste one or more M-Pesa confirmation messages. You can review everything before it's saved.</p>
        <textarea id="mpesaText" rows="6" placeholder="QGH7A1B2C3 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 17/7/24 at 2:15 PM..."></textarea>
        <div class="modal-actions">
            <button type="button" class="secondary-button" data-close>Close</button>
            <button type="button" class="primary-button" id="mpesaParse">Read messages</button>
        </div>
        <div id="mpesaResult"></div>`, true);

    const cats = [...$("category").options].map(o => o.value);
    let parsed = { items: [], skipped: [] };
    const existing = new Set(transactions.map(t => t.id));

    function renderResult() {
        const { items, skipped } = parsed;
        const box = overlay.querySelector("#mpesaResult");
        if (!items.length) {
            box.innerHTML = `<p class="mp-note">No transactions found. Make sure you copied the full message, starting with the transaction code (like QGH7A1B2C3).${
                skipped.length ? ` ${skipped.length} message(s) were skipped (${[...new Set(skipped.map(s => s.reason))].join(", ")}).` : ""}</p>`;
            return;
        }
        const picked = items.filter(i => i.selected);
        const fees = picked.reduce((s, i) => s + (i.fee || 0), 0);
        box.innerHTML = `
            <div class="mp-list">
                ${items.map((it, i) => `
                    <label class="mp-row ${it.dup ? "dup" : ""}">
                        <input type="checkbox" data-sel="${i}" ${it.selected ? "checked" : ""} ${it.dup ? "disabled" : ""}>
                        <div class="mp-main"><strong>${escapeHTML(it.description)}</strong>
                            <small>${formatDate(it.date)}${it.dup ? " · already added" : ""}</small></div>
                        <select data-cat="${i}" ${it.dup ? "disabled" : ""}>
                            ${cats.map(c => `<option ${c === it.category ? "selected" : ""}>${escapeHTML(c)}</option>`).join("")}
                        </select>
                        <span class="mp-amt ${it.type}">${it.type === "income" ? "+" : "-"}${formatCurrency(it.amount)}</span>
                    </label>`).join("")}
            </div>
            ${items.some(i => i.fee > 0) ? `
                <label class="mp-fee"><input type="checkbox" id="mpesaFees" ${parsed.fees ? "checked" : ""}>
                    Also record M-Pesa transaction fees as expenses (${formatCurrency(fees)})</label>` : ""}
            ${skipped.length ? `<p class="mp-note">${skipped.length} message(s) skipped: ${[...new Set(skipped.map(s => s.reason))].join(", ")}.</p>` : ""}
            <div class="modal-actions">
                <button type="button" class="primary-button" id="mpesaImport" ${picked.length ? "" : "disabled"}>
                    Import ${picked.length} transaction${picked.length === 1 ? "" : "s"}</button>
            </div>`;
    }

    overlay.querySelector("#mpesaParse").addEventListener("click", () => {
        const result = parseMpesa(overlay.querySelector("#mpesaText").value);
        parsed = {
            skipped: result.skipped, fees: true,
            items: result.items.map(it => ({ ...it, dup: existing.has(it.id), selected: !existing.has(it.id) }))
        };
        renderResult();
    });

    overlay.addEventListener("change", e => {
        if (e.target.dataset.sel !== undefined) parsed.items[e.target.dataset.sel].selected = e.target.checked;
        if (e.target.dataset.cat !== undefined) parsed.items[e.target.dataset.cat].category = e.target.value;
        if (e.target.id === "mpesaFees") parsed.fees = e.target.checked;
        if (e.target.dataset.sel !== undefined) renderResult();
    });

    overlay.addEventListener("click", e => {
        if (e.target.id !== "mpesaImport") return;
        const now = new Date().toISOString();
        const txs = [];
        parsed.items.filter(i => i.selected).forEach(i => {
            txs.push({ id: i.id, description: i.description, amount: i.amount, type: i.type,
                category: i.category, date: i.date, createdAt: now });
            if (parsed.fees && i.fee > 0 && !existing.has(`${i.id}-fee`)) {
                txs.push({ id: `${i.id}-fee`, description: `M-Pesa fee (${i.code || "SMS"})`, amount: i.fee,
                    type: "expense", category: "Bills", date: i.date, createdAt: now });
            }
        });
        if (!txs.length) return;
        importTransactions(currentUser.uid, txs).catch(reportWriteError);

        // Make sure the imported transactions are visible.
        if (selectedMonth !== "all" && !txs.some(t => monthKey(t.date) === selectedMonth)) {
            selectedMonth = monthKey(txs.map(t => t.date).sort().pop());
        }
        close();
        toast(`Imported ${txs.length} transaction${txs.length === 1 ? "" : "s"} from M-Pesa`, "success");
    });
}
document.querySelectorAll("[data-open-mpesa]").forEach(b => b.addEventListener("click", openMpesaImport));

// ---------- auth + live data ----------
function updateUserInformation() {
    if (!currentUser) return;
    const name = currentUser.displayName || "PesaTrack User";
    $("userName").textContent = name;
    $("userEmail").textContent = currentUser.email || "No email";
    $("welcomeText").textContent = `Welcome back, ${name.split(" ")[0]}!`;
}

// One-time move of old browser-only data into the user's cloud account.
async function migrateLocalData(uid) {
    const key = `pesatrack_transactions_${uid}`;
    const flag = `pesatrack_migrated_${uid}`;
    if (localStorage.getItem(flag)) return;
    try {
        const old = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(old) && old.length) {
            const valid = old.filter(t => t && t.id && Number(t.amount) > 0 && t.date);
            await importTransactions(uid, valid);
            toast(`Moved ${valid.length} saved transactions to your account`, "success");
        }
        localStorage.setItem(flag, "1");
    } catch (e) {
        console.error("Migration failed (will retry next visit):", e);
    }
}

function renderAll() {
    renderMonthBar();
    updateDashboard();
    renderRecentTransactions();
    renderTransactions();
    renderReports();
    renderBanner();
    renderBudgets();
    renderComparison();
    renderCharts();
}

onAuthStateChanged(auth, user => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (unsubscribeBudgets) { unsubscribeBudgets(); unsubscribeBudgets = null; }
    if (!user) {
        window.location.href = "auth.html";
        return;
    }
    currentUser = user;
    updateUserInformation();
    setSync(navigator.onLine ? "syncing" : "offline");

    migrateLocalData(user.uid);
    unsubscribeBudgets = subscribeBudgets(
        user.uid,
        limits => { budgets = limits; renderAll(); },
        error => console.error("Budget sync error:", error)
    );
    unsubscribe = subscribeTransactions(
        user.uid,
        list => {
            transactions = list;
            if (!monthDecided) {
                // First load: show "All time" if this month is empty but older data exists.
                monthDecided = true;
                if (list.length && !list.some(t => monthKey(t.date) === currentMonthKey())) selectedMonth = "all";
            }
            renderAll();
            setSync(navigator.onLine ? "online" : "offline");
        },
        error => {
            console.error("Live sync error:", error);
            toast("Couldn't load your data. Check your connection and refresh.", "error");
            setSync("offline");
        }
    );
});

async function logout() {
    try {
        await signOut(auth);
        window.location.href = "auth.html";
    } catch (e) {
        console.error("Logout error:", e);
        toast("Unable to log out. Please try again.", "error");
    }
}
$("logoutButton").addEventListener("click", logout);
$("settingsLogoutButton").addEventListener("click", logout);

// ---------- PWA ----------
window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installButton").hidden = false;
});
$("installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installButton").hidden = true;
});
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
        navigator.serviceWorker.register("./service-worker.js").catch(e => console.error("Service worker error:", e)));
}

applyTheme();
