// Single source of truth for categories: icons, colours, and which type they belong to.
// The older categories (Food, Transport, ...) are kept so existing transactions still match.

const E = (name, icon, color) => ({ name, icon, color, type: "expense" });
const I = (name, icon, color) => ({ name, icon, color, type: "income" });

export const BUILTIN = [
    // ---- expenses ----
    E("Food", "🍔", "#f97316"), E("Groceries", "🛒", "#84cc16"), E("Rent", "🏠", "#6366f1"),
    E("Utilities", "💡", "#eab308"), E("Bills", "🧾", "#8b5cf6"), E("Airtime & Data", "📱", "#06b6d4"),
    E("Subscriptions", "📺", "#d946ef"), E("Transport", "🚗", "#0ea5e9"), E("Fuel", "⛽", "#64748b"),
    E("Shopping", "🛍️", "#ec4899"), E("Clothing", "👕", "#f472b6"), E("Personal Care", "💇", "#fb7185"),
    E("Health", "❤️", "#ef4444"), E("Insurance", "🛡️", "#0d9488"), E("Education", "📚", "#14b8a6"),
    E("Children", "🧒", "#f59e0b"), E("Entertainment", "🎮", "#eab308"), E("Travel", "✈️", "#38bdf8"),
    E("Gifts & Donations", "🎁", "#e11d48"), E("Family Support", "🤝", "#10b981"), E("Loans & Debt", "💳", "#b91c1c"),
    E("Savings & Investments", "🏦", "#16a34a"), E("Home & Household", "🧰", "#a16207"),
    E("Business Expenses", "🏢", "#475569"), E("Fees & Charges", "🧮", "#78716c"), E("Taxes", "🏛️", "#334155"),
    E("Pets", "🐾", "#c2410c"),
    // ---- income ----
    I("Salary", "💼", "#16a34a"), I("Business", "🏢", "#0f766e"), I("Freelance", "💻", "#2563eb"),
    I("Side Hustle", "🛠️", "#7c3aed"), I("Bonus", "🎉", "#d97706"), I("Allowance", "🎒", "#0891b2"),
    I("Rental Income", "🏘️", "#4f46e5"), I("Investment Returns", "📈", "#15803d"), I("Gifts Received", "🎀", "#db2777"),
    I("Refunds", "🔄", "#0284c7"), I("Loan Received", "🤲", "#9333ea"),
    // ---- both ----
    { name: "Other", icon: "💰", color: "#6b7280", type: "both" }
];

export const EMOJI_CHOICES = ["🍽️", "☕", "🥗", "🚌", "🚕", "🏍️", "🎓", "💊", "🏋️", "🎵", "🎬", "📚", "🧴", "🧹", "🔧", "🌱", "🐶", "👶", "⚽", "📦", "💻", "📞", "🛠️", "⭐"];

const FALLBACK_COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444"];
let custom = []; // [{ id, name, icon, type: "expense" | "income" }]

export function setCustomCategories(list) {
    custom = (Array.isArray(list) ? list : []).filter(c => c && c.name && (c.type === "expense" || c.type === "income"));
}
export const getCustomCategories = () => custom;

const byName = n => BUILTIN.find(c => c.name === n) || custom.find(c => c.name === n);
const hash = s => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const iconFor = name => byName(name)?.icon || "💰";
export const colorFor = name => byName(name)?.color || FALLBACK_COLORS[hash(String(name)) % FALLBACK_COLORS.length];
export const isBuiltin = name => BUILTIN.some(c => c.name === name);
export const categoryExists = name => !!byName(name) || [...BUILTIN, ...custom].some(c => c.name.toLowerCase() === String(name).toLowerCase());

// Categories for a type, with "Other" always last.
export function categoriesFor(type) {
    const list = [...BUILTIN.filter(c => c.type === type), ...custom.filter(c => c.type === type), ...BUILTIN.filter(c => c.type === "both")];
    return list;
}

function option(value, label, selected) {
    const o = document.createElement("option");
    o.value = value; o.textContent = label; o.selected = !!selected;
    return o;
}

// Fill a <select> with the categories for a type. A category that no longer fits
// (older data, or a deleted custom one) is kept so editing never loses it.
export function fillSelect(select, type, selected) {
    const keep = selected ?? select.value;
    select.replaceChildren();
    const names = categoriesFor(type).map(c => c.name);
    if (keep && !names.includes(keep)) names.unshift(keep);
    names.forEach(n => select.append(option(n, `${iconFor(n)} ${n}`, n === keep)));
    if (!names.includes(keep)) select.selectedIndex = 0;
}

// Filter dropdown: "All" plus grouped Expense / Income lists.
export function fillFilter(select) {
    const keep = select.value || "all";
    select.replaceChildren(option("all", "All Categories", keep === "all"));
    const group = (label, type) => {
        const g = document.createElement("optgroup");
        g.label = label;
        categoriesFor(type).filter(c => c.type !== "both").forEach(c => g.append(option(c.name, `${c.icon} ${c.name}`, c.name === keep)));
        select.append(g);
    };
    group("Expenses", "expense");
    group("Income", "income");
    select.append(option("Other", "💰 Other", keep === "Other"));
}
