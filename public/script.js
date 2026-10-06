// =====================================================
// PESATRACK APP LOGIC (Firestore-backed, offline-capable)
// =====================================================
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    subscribeTransactions, saveTransaction, deleteTransaction,
    clearTransactions, importTransactions
} from "./firestore.js";

let transactions = [];
let currentUser = null;
let unsubscribe = null;
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

    saveTransaction(currentUser.uid, tx).catch(reportWriteError); // UI updates instantly via snapshot
    $("transactionForm").reset();
    dateInput.value = localToday();
    toast("Transaction added", "success");
});

// ---------- totals + dashboard ----------
function calculateTotals() {
    let income = 0, expenses = 0;
    transactions.forEach(t => (t.type === "income" ? (income += Number(t.amount)) : (expenses += Number(t.amount))));
    const balance = income - expenses;
    const savingsRate = income > 0 ? (balance / income) * 100 : 0; // can be negative (overspending)
    return { income, expenses, balance, savingsRate };
}

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
    const recent = [...transactions].sort(byNewest).slice(0, 5);
    $("recentTransactions").innerHTML = recent.length
        ? recent.map(transactionHTML).join("")
        : emptyState("💳", "No transactions yet", "Add your first transaction above.");
}

function renderTransactions() {
    const search = $("searchInput").value.trim().toLowerCase();
    const type = $("typeFilter").value;
    const category = $("categoryFilter").value;
    const sort = $("sortFilter").value;

    let list = transactions.filter(t =>
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
    transactions.filter(x => x.type === "expense").forEach(x => {
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
    updateDashboard();
    renderRecentTransactions();
    renderTransactions();
    renderReports();
}

onAuthStateChanged(auth, user => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!user) {
        window.location.href = "auth.html";
        return;
    }
    currentUser = user;
    updateUserInformation();
    setSync(navigator.onLine ? "syncing" : "offline");

    migrateLocalData(user.uid);
    unsubscribe = subscribeTransactions(
        user.uid,
        list => {
            transactions = list;
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
