// "Needs your attention" strip at the top of the dashboard:
// budgets that are near or over their limit, recurring items due soon, and goals with deadlines coming up.
import { nextOccurrence } from "./recurrence.js";

const DAY = 864e5;
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY);

export function initAttention(c) {
    const esc = c.escapeHTML, fmt = c.formatCurrency;
    const box = document.getElementById("attention");

    function collect() {
        const items = [], today = c.localToday();
        const { goals = [], recurring = [] } = c.getFeatureData();

        // 1) budgets
        const key = c.budgetMonth(), spent = c.spentByCategory(key);
        const suffix = key === c.currentMonthKey() ? "" : ` (${c.monthLabel(key)})`;
        Object.entries(c.getBudgets()).filter(([, limit]) => limit > 0).forEach(([cat, limit]) => {
            const s = spent[cat] || 0, pct = (s / limit) * 100;
            if (pct >= 100) {
                items.push({ rank: 0, level: "over", icon: "🚨", go: "budgets",
                    title: `${cat}: over budget${suffix}`, sub: `${fmt(s - limit)} over your ${fmt(limit)} limit · ${pct.toFixed(0)}%` });
            } else if (pct >= 80) {
                items.push({ rank: 1, level: "warn", icon: "⚠️", go: "budgets",
                    title: `${cat}: ${pct.toFixed(0)}% of budget used${suffix}`, sub: `${fmt(limit - s)} left of ${fmt(limit)}` });
            }
        });

        // 2) recurring items due in the next 7 days
        recurring.filter(r => r.active !== false).forEach(r => {
            const next = nextOccurrence(r, today);
            if (!next) return;
            const d = daysBetween(today, next);
            if (d > 7) return;
            items.push({ rank: 2 + d / 10, level: "info", icon: "🔁", go: "recurring",
                title: `${r.description} · ${r.type === "income" ? "+" : "-"}${fmt(r.amount)}`,
                sub: `${d === 1 ? "Tomorrow" : `In ${d} days`} · ${c.formatDate(next)}` });
        });

        // 3) goals with a deadline within 30 days (or already passed)
        goals.filter(g => g.deadline && g.saved < g.target).forEach(g => {
            const d = daysBetween(today, g.deadline), left = fmt(g.target - g.saved);
            if (d < 0) items.push({ rank: 1.5, level: "warn", icon: "🎯", go: "goals", title: `${g.name}: deadline passed`, sub: `${left} still to save` });
            else if (d <= 30) items.push({ rank: 3 + d / 100, level: "info", icon: "🎯", go: "goals",
                title: `${g.name}: ${d === 0 ? "due today" : `${d} day${d === 1 ? "" : "s"} left`}`, sub: `${left} still to save` });
        });

        return items.sort((a, b) => a.rank - b.rank).slice(0, 6);
    }

    function render() {
        if (!box) return;
        const items = collect();
        box.hidden = !items.length;
        box.innerHTML = items.length
            ? `<div class="attention-head">Needs your attention</div>
               <div class="attention-list">${items.map(i => `
                   <button type="button" class="att-item ${i.level}" data-go="${i.go}">
                       <span class="att-icon" aria-hidden="true">${i.icon}</span>
                       <span class="att-text"><strong>${esc(i.title)}</strong><span>${esc(i.sub)}</span></span>
                   </button>`).join("")}</div>`
            : "";
    }

    if (box) box.addEventListener("click", e => {
        const b = e.target.closest("[data-go]");
        if (b) c.go(b.dataset.go);
    });

    return { render, collect };
}
