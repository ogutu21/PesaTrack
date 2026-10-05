// =====================================================
// PESATRACK
// PERSONAL FINANCE TRACKER
// =====================================================


// =====================================================
// FIREBASE
// =====================================================


import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


const firebaseConfig = {

    apiKey: "AIzaSyATQU2_8h29Ki8rF-AaPb3cQ7RyD3HLLCw",

    authDomain: "pesatrack-92632.firebaseapp.com",

    projectId: "pesatrack-92632",

    storageBucket: "pesatrack-92632.firebasestorage.app",

    messagingSenderId: "227171165751",

    appId: "1:227171165751:web:255aea2c6618dfdce981b2",

    measurementId: "G-SL0RL58835"

};


const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);


// =====================================================
// DATA
// =====================================================

let transactions = [];

let currentUser = null;

let deferredInstallPrompt = null;


// =====================================================
// DOM
// =====================================================

const pageSections =
    document.querySelectorAll(".page-section");

const navItems =
    document.querySelectorAll(".nav-item");

const mobileNavItems =
    document.querySelectorAll(".mobile-nav-item");

const pageTitle =
    document.getElementById("pageTitle");

const welcomeText =
    document.getElementById("welcomeText");

const transactionForm =
    document.getElementById("transactionForm");

const recentTransactions =
    document.getElementById("recentTransactions");

const transactionList =
    document.getElementById("transactionList");

const searchInput =
    document.getElementById("searchInput");

const typeFilter =
    document.getElementById("typeFilter");

const categoryFilter =
    document.getElementById("categoryFilter");

const sortFilter =
    document.getElementById("sortFilter");

const clearAllButton =
    document.getElementById("clearAllButton");

const themeButton =
    document.getElementById("themeButton");

const settingsThemeButton =
    document.getElementById("settingsThemeButton");

const logoutButton =
    document.getElementById("logoutButton");

const settingsLogoutButton =
    document.getElementById("settingsLogoutButton");

const settingsClearButton =
    document.getElementById("settingsClearButton");

const mobileMenuButton =
    document.getElementById("mobileMenuButton");

const sidebar =
    document.querySelector(".sidebar");


// =====================================================
// DEFAULT DATE
// =====================================================

const dateInput =
    document.getElementById("date");

if (dateInput) {

    const today =
        new Date().toISOString().split("T")[0];

    dateInput.value = today;

}


// =====================================================
// CURRENCY
// =====================================================

function formatCurrency(amount) {

    return new Intl.NumberFormat(
        "en-KE",
        {
            style: "currency",
            currency: "KES",
            minimumFractionDigits: 2
        }
    ).format(amount);

}


// =====================================================
// LOCAL STORAGE KEY
// =====================================================

function getStorageKey() {

    if (currentUser) {

        return `pesatrack_transactions_${currentUser.uid}`;

    }

    return "pesatrack_transactions_guest";

}


// =====================================================
// LOAD TRANSACTIONS
// =====================================================

function loadTransactions() {

    try {

        const saved =
            localStorage.getItem(getStorageKey());

        transactions =
            saved ? JSON.parse(saved) : [];

        if (!Array.isArray(transactions)) {

            transactions = [];

        }

    } catch (error) {

        console.error(
            "Could not load transactions:",
            error
        );

        transactions = [];

    }

}


// =====================================================
// SAVE TRANSACTIONS
// =====================================================

function saveTransactions() {

    localStorage.setItem(
        getStorageKey(),
        JSON.stringify(transactions)
    );

}


// =====================================================
// NAVIGATION
// =====================================================

function openSection(sectionName) {

    pageSections.forEach(section => {

        section.classList.remove("active");

    });


    const selectedSection =
        document.getElementById(sectionName);

    if (selectedSection) {

        selectedSection.classList.add("active");

    }


    navItems.forEach(item => {

        item.classList.toggle(
            "active",
            item.dataset.section === sectionName
        );

    });


    mobileNavItems.forEach(item => {

        item.classList.toggle(
            "active",
            item.dataset.section === sectionName
        );

    });


    const titles = {

        dashboard: "Dashboard",

        transactions: "Transactions",

        reports: "Reports",

        settings: "Settings"

    };


    pageTitle.textContent =
        titles[sectionName] || "PesaTrack";


    if (sectionName === "settings") {

        updateUserInformation();

    }


    if (sectionName === "reports") {

        renderReports();

    }


    sidebar.classList.remove("open");

}


// =====================================================
// NAVIGATION EVENTS
// =====================================================

navItems.forEach(item => {

    item.addEventListener(
        "click",
        () => {

            openSection(
                item.dataset.section
            );

        }
    );

});


mobileNavItems.forEach(item => {

    item.addEventListener(
        "click",
        () => {

            openSection(
                item.dataset.section
            );

        }
    );

});


document
    .querySelectorAll("[data-section-link]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                openSection(
                    button.dataset.sectionLink
                );

            }
        );

    });


// =====================================================
// MOBILE MENU
// =====================================================

mobileMenuButton.addEventListener(
    "click",
    () => {

        sidebar.classList.toggle("open");

    }
);


// =====================================================
// ADD TRANSACTION
// =====================================================

transactionForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        const description =
            document
                .getElementById("description")
                .value
                .trim();


        const amount =
            Number(
                document
                    .getElementById("amount")
                    .value
            );


        const type =
            document
                .getElementById("type")
                .value;


        const category =
            document
                .getElementById("category")
                .value;


        const date =
            document
                .getElementById("date")
                .value;


        if (
            !description ||
            !amount ||
            amount <= 0 ||
            !date
        ) {

            alert(
                "Please enter valid transaction details."
            );

            return;

        }


        const transaction = {

            id:
                Date.now().toString(),

            description,

            amount,

            type,

            category,

            date,

            createdAt:
                new Date().toISOString()

        };


        transactions.unshift(transaction);


        saveTransactions();

        renderAll();


        transactionForm.reset();


        dateInput.value =
            new Date()
                .toISOString()
                .split("T")[0];


        alert(
            "Transaction added successfully!"
        );

    }
);


// =====================================================
// CALCULATIONS
// =====================================================

function calculateTotals() {

    let income = 0;

    let expenses = 0;


    transactions.forEach(transaction => {

        if (transaction.type === "income") {

            income += Number(
                transaction.amount
            );

        } else {

            expenses += Number(
                transaction.amount
            );

        }

    });


    const balance =
        income - expenses;


    let savingsRate = 0;


    if (income > 0) {

        savingsRate =
            ((income - expenses) / income) * 100;

    }


    return {

        income,

        expenses,

        balance,

        savingsRate

    };

}


// =====================================================
// UPDATE DASHBOARD
// =====================================================

function updateDashboard() {

    const totals =
        calculateTotals();


    document.getElementById(
        "balanceAmount"
    ).textContent =
        formatCurrency(totals.balance);


    document.getElementById(
        "incomeAmount"
    ).textContent =
        formatCurrency(totals.income);


    document.getElementById(
        "expenseAmount"
    ).textContent =
        formatCurrency(totals.expenses);


    document.getElementById(
        "savingsRate"
    ).textContent =
        `${Math.max(
            totals.savingsRate,
            0
        ).toFixed(1)}%`;

}


// =====================================================
// TRANSACTION HTML
// =====================================================

function transactionHTML(transaction) {

    const isIncome =
        transaction.type === "income";


    const sign =
        isIncome ? "+" : "-";


    const icon =
        getCategoryIcon(
            transaction.category
        );


    const date =
        formatDate(transaction.date);


    return `

        <div
            class="transaction-item"
            data-id="${escapeHTML(transaction.id)}"
        >

            <div class="transaction-left">

                <div class="transaction-icon">
                    ${icon}
                </div>

                <div class="transaction-info">

                    <h4>
                        ${escapeHTML(
                            transaction.description
                        )}
                    </h4>

                    <p>
                        ${escapeHTML(
                            transaction.category
                        )}
                        •
                        ${date}
                    </p>

                </div>

            </div>


            <div class="transaction-right">

                <div
                    class="transaction-amount
                    ${isIncome ? "income" : "expense"}"
                >
                    ${sign}${formatCurrency(
                        Number(transaction.amount)
                    )}
                </div>


                <div class="transaction-actions">

                    <button
                        data-action="edit"
                        data-id="${transaction.id}"
                    >
                        Edit
                    </button>

                    <button
                        data-action="delete"
                        data-id="${transaction.id}"
                    >
                        Delete
                    </button>

                </div>

            </div>

        </div>

    `;

}


// =====================================================
// RENDER RECENT TRANSACTIONS
// =====================================================

function renderRecentTransactions() {

    const recent =
        transactions.slice(0, 5);


    if (recent.length === 0) {

        recentTransactions.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    💳
                </div>

                <h3>No transactions yet</h3>

                <p>
                    Add your first transaction above.
                </p>

            </div>

        `;

        return;

    }


    recentTransactions.innerHTML =
        recent
            .map(transactionHTML)
            .join("");

}


// =====================================================
// RENDER TRANSACTIONS
// =====================================================

function renderTransactions() {

    let filtered =
        [...transactions];


    const search =
        searchInput.value
            .trim()
            .toLowerCase();


    const type =
        typeFilter.value;


    const category =
        categoryFilter.value;


    const sort =
        sortFilter.value;


    if (search) {

        filtered =
            filtered.filter(transaction =>

                transaction.description
                    .toLowerCase()
                    .includes(search)

                ||

                transaction.category
                    .toLowerCase()
                    .includes(search)

            );

    }


    if (type !== "all") {

        filtered =
            filtered.filter(
                transaction =>
                    transaction.type === type
            );

    }


    if (category !== "all") {

        filtered =
            filtered.filter(
                transaction =>
                    transaction.category === category
            );

    }


    if (sort === "newest") {

        filtered.sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        );

    }


    if (sort === "oldest") {

        filtered.sort(
            (a, b) =>
                new Date(a.date) -
                new Date(b.date)
        );

    }


    if (sort === "highest") {

        filtered.sort(
            (a, b) =>
                Number(b.amount) -
                Number(a.amount)
        );

    }


    if (sort === "lowest") {

        filtered.sort(
            (a, b) =>
                Number(a.amount) -
                Number(b.amount)
        );

    }


    if (filtered.length === 0) {

        transactionList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    🔍
                </div>

                <h3>No transactions found</h3>

                <p>
                    Try changing your search or filters.
                </p>

            </div>

        `;

        return;

    }


    transactionList.innerHTML =
        filtered
            .map(transactionHTML)
            .join("");

}


// =====================================================
// TRANSACTION ACTIONS
// =====================================================

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-action]"
            );


        if (!button) {

            return;

        }


        const id =
            button.dataset.id;


        if (
            button.dataset.action === "delete"
        ) {

            deleteTransaction(id);

        }


        if (
            button.dataset.action === "edit"
        ) {

            openEditModal(id);

        }

    }
);


// =====================================================
// DELETE TRANSACTION
// =====================================================

function deleteTransaction(id) {

    const transaction =
        transactions.find(
            item => item.id === id
        );


    if (!transaction) {

        return;

    }


    const confirmed =
        confirm(
            `Delete "${transaction.description}"?`
        );


    if (!confirmed) {

        return;

    }


    transactions =
        transactions.filter(
            item => item.id !== id
        );


    saveTransactions();

    renderAll();

}


// =====================================================
// CLEAR ALL
// =====================================================

clearAllButton.addEventListener(
    "click",
    clearAllTransactions
);


settingsClearButton.addEventListener(
    "click",
    clearAllTransactions
);


function clearAllTransactions() {

    if (transactions.length === 0) {

        alert(
            "There are no transactions to clear."
        );

        return;

    }


    const confirmed =
        confirm(
            "Are you sure you want to delete ALL transactions?"
        );


    if (!confirmed) {

        return;

    }


    transactions = [];


    saveTransactions();

    renderAll();

}


// =====================================================
// EDIT MODAL
// =====================================================

const editModal =
    document.getElementById("editModal");

const editForm =
    document.getElementById(
        "editTransactionForm"
    );


function openEditModal(id) {

    const transaction =
        transactions.find(
            item => item.id === id
        );


    if (!transaction) {

        return;

    }


    document.getElementById(
        "editId"
    ).value = transaction.id;


    document.getElementById(
        "editDescription"
    ).value =
        transaction.description;


    document.getElementById(
        "editAmount"
    ).value =
        transaction.amount;


    document.getElementById(
        "editType"
    ).value =
        transaction.type;


    document.getElementById(
        "editCategory"
    ).value =
        transaction.category;


    document.getElementById(
        "editDate"
    ).value =
        transaction.date;


    editModal.hidden = false;

}


document.getElementById(
    "closeModal"
).addEventListener(
    "click",
    closeEditModal
);


document.getElementById(
    "cancelEdit"
).addEventListener(
    "click",
    closeEditModal
);


function closeEditModal() {

    editModal.hidden = true;

}


editModal.addEventListener(
    "click",
    event => {

        if (
            event.target === editModal
        ) {

            closeEditModal();

        }

    }
);


// =====================================================
// SAVE EDIT
// =====================================================

editForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        const id =
            document.getElementById(
                "editId"
            ).value;


        const transaction =
            transactions.find(
                item => item.id === id
            );


        if (!transaction) {

            return;

        }


        transaction.description =
            document
                .getElementById(
                    "editDescription"
                )
                .value
                .trim();


        transaction.amount =
            Number(
                document.getElementById(
                    "editAmount"
                ).value
            );


        transaction.type =
            document.getElementById(
                "editType"
            ).value;


        transaction.category =
            document.getElementById(
                "editCategory"
            ).value;


        transaction.date =
            document.getElementById(
                "editDate"
            ).value;


        saveTransactions();

        renderAll();

        closeEditModal();

    }
);


// =====================================================
// REPORTS
// =====================================================

function renderReports() {

    const totals =
        calculateTotals();


    document.getElementById(
        "reportIncome"
    ).textContent =
        formatCurrency(totals.income);


    document.getElementById(
        "reportExpenses"
    ).textContent =
        formatCurrency(totals.expenses);


    document.getElementById(
        "reportBalance"
    ).textContent =
        formatCurrency(totals.balance);


    document.getElementById(
        "reportSavings"
    ).textContent =
        `${Math.max(
            totals.savingsRate,
            0
        ).toFixed(1)}%`;


    const categories = {};


    transactions
        .filter(
            transaction =>
                transaction.type === "expense"
        )
        .forEach(transaction => {

            const category =
                transaction.category;

            categories[category] =
                (categories[category] || 0)
                +
                Number(transaction.amount);

        });


    const categoryChart =
        document.getElementById(
            "categoryChart"
        );


    const entries =
        Object.entries(categories)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );


    if (entries.length === 0) {

        categoryChart.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    📊
                </div>

                <h3>No report data yet</h3>

                <p>
                    Add expenses to see your report.
                </p>

            </div>

        `;

        return;

    }


    const maximum =
        entries[0][1];


    categoryChart.innerHTML =
        entries
            .map(
                ([category, amount]) => {

                    const percentage =
                        (amount / maximum) * 100;


                    return `

                        <div class="category-row">

                            <span class="category-name">
                                ${escapeHTML(category)}
                            </span>

                            <div class="progress">

                                <div
                                    class="progress-bar"
                                    style="width:${percentage}%"
                                ></div>

                            </div>

                            <span class="category-value">
                                ${formatCurrency(amount)}
                            </span>

                        </div>

                    `;

                }
            )
            .join("");

}


// =====================================================
// FILTER EVENTS
// =====================================================

searchInput.addEventListener(
    "input",
    renderTransactions
);

typeFilter.addEventListener(
    "change",
    renderTransactions
);

categoryFilter.addEventListener(
    "change",
    renderTransactions
);

sortFilter.addEventListener(
    "change",
    renderTransactions
);


// =====================================================
// DARK MODE
// =====================================================

function applyTheme() {

    const theme =
        localStorage.getItem(
            "pesatrack_theme"
        );


    if (theme === "dark") {

        document.body.classList.add("dark");

        themeButton.textContent = "☀️";

        settingsThemeButton.textContent =
            "☀️ Light Mode";

    } else {

        document.body.classList.remove("dark");

        themeButton.textContent = "🌙";

        settingsThemeButton.textContent =
            "🌙 Dark Mode";

    }

}


function toggleTheme() {

    const isDark =
        document.body.classList.contains(
            "dark"
        );


    if (isDark) {

        localStorage.setItem(
            "pesatrack_theme",
            "light"
        );

    } else {

        localStorage.setItem(
            "pesatrack_theme",
            "dark"
        );

    }


    applyTheme();

}


themeButton.addEventListener(
    "click",
    toggleTheme
);


settingsThemeButton.addEventListener(
    "click",
    toggleTheme
);


// =====================================================
// FIREBASE AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    user => {

        if (!user) {

            window.location.href =
                "auth.html";

            return;

        }


        currentUser = user;


        loadTransactions();

        updateUserInformation();

        renderAll();

    }
);


// =====================================================
// USER INFORMATION
// =====================================================

function updateUserInformation() {

    if (!currentUser) {

        return;

    }


    const name =
        currentUser.displayName ||
        "PesaTrack User";


    const email =
        currentUser.email ||
        "No email";


    document.getElementById(
        "userName"
    ).textContent = name;


    document.getElementById(
        "userEmail"
    ).textContent = email;


    welcomeText.textContent =
        `Welcome back, ${name.split(" ")[0]}!`;

}


// =====================================================
// LOGOUT
// =====================================================

logoutButton.addEventListener(
    "click",
    logout
);


settingsLogoutButton.addEventListener(
    "click",
    logout
);


async function logout() {

    try {

        await signOut(auth);

        window.location.href =
            "auth.html";

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

        alert(
            "Unable to log out. Please try again."
        );

    }

}


// =====================================================
// PWA INSTALL
// =====================================================

window.addEventListener(
    "beforeinstallprompt",
    event => {

        event.preventDefault();

        deferredInstallPrompt =
            event;

        const installButton =
            document.getElementById(
                "installButton"
            );

        installButton.hidden = false;

    }
);


document
    .getElementById("installButton")
    .addEventListener(
        "click",
        async () => {

            if (!deferredInstallPrompt) {

                return;

            }


            deferredInstallPrompt.prompt();


            await deferredInstallPrompt.userChoice;


            deferredInstallPrompt = null;


            document.getElementById(
                "installButton"
            ).hidden = true;

        }
    );


// =====================================================
// SERVICE WORKER
// =====================================================

if ("serviceWorker" in navigator) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register(
                    "./service-worker.js"
                )
                .then(
                    registration => {

                        console.log(
                            "PesaTrack service worker registered:",
                            registration.scope
                        );

                    }
                )
                .catch(
                    error => {

                        console.error(
                            "Service worker error:",
                            error
                        );

                    }
                );

        }
    );

}


// =====================================================
// HELPERS
// =====================================================

function formatDate(dateString) {

    if (!dateString) {

        return "";

    }


    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function getCategoryIcon(category) {

    const icons = {

        Food: "🍔",

        Transport: "🚗",

        Shopping: "🛍️",

        Bills: "🧾",

        Education: "📚",

        Entertainment: "🎮",

        Health: "❤️",

        Salary: "💼",

        Business: "🏢",

        Other: "💰"

    };


    return icons[category] || "💰";

}


function escapeHTML(value) {

    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}


// =====================================================
// RENDER EVERYTHING
// =====================================================

function renderAll() {

    updateDashboard();

    renderRecentTransactions();

    renderTransactions();

    renderReports();

    applyTheme();

}


// =====================================================
// START
// =====================================================

applyTheme();

console.log(
    "PesaTrack dashboard loaded successfully."
);