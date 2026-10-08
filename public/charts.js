// Dependency-free SVG charts. Pure functions that return HTML strings.

import { colorFor } from "./categories.js";

const esc = v => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");



// entries: [[category, amount], ...] sorted largest first
export function donutHTML(entries, formatMoney) {
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (!total) return "";
    let offset = 25; // start at 12 o'clock
    const segments = entries.map(([cat, amt]) => {
        const pct = (amt / total) * 100;
        const seg = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${colorFor(cat)}" stroke-width="6"
            stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}" stroke-dashoffset="${offset.toFixed(3)}">
            <title>${esc(cat)}: ${esc(formatMoney(amt))} (${pct.toFixed(0)}%)</title></circle>`;
        offset -= pct;
        return seg;
    }).join("");

    const legend = entries.map(([cat, amt]) => `
        <li><span class="dot" style="background:${colorFor(cat)}"></span>
            <span class="legend-name">${esc(cat)}</span>
            <span class="legend-value">${((amt / total) * 100).toFixed(0)}%</span></li>`).join("");

    return `
        <div class="donut-wrap">
            <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Spending by category">
                <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--background)" stroke-width="6"></circle>
                ${segments}
                <text x="21" y="20.2" text-anchor="middle" class="donut-label">Spent</text>
                <text x="21" y="25.2" text-anchor="middle" class="donut-total">${esc(formatMoney(total))}</text>
            </svg>
            <ul class="legend">${legend}</ul>
        </div>`;
}

// months: [{ label, income, expense }]
export function trendHTML(months, formatShort, W = 360, H = 190) {
    const max = Math.max(...months.flatMap(m => [m.income, m.expense]), 0);
    if (!max) return "";
    const top = 14, bottom = 26, left = 6, right = 6;
    const plotH = H - top - bottom;
    const slot = (W - left - right) / months.length;
    const barW = Math.min(W > 500 ? 34 : 16, slot / 2.6);

    const bars = months.map((m, i) => {
        const cx = left + slot * i + slot / 2;
        const h = v => Math.max((v / max) * plotH, v > 0 ? 2 : 0);
        const hi = h(m.income), he = h(m.expense);
        return `
            <g>
                <rect class="bar-income" x="${(cx - barW - 1).toFixed(1)}" y="${(top + plotH - hi).toFixed(1)}" width="${barW.toFixed(1)}" height="${hi.toFixed(1)}" rx="3">
                    <title>${esc(m.label)} income: ${esc(formatShort(m.income))}</title></rect>
                <rect class="bar-expense" x="${(cx + 1).toFixed(1)}" y="${(top + plotH - he).toFixed(1)}" width="${barW.toFixed(1)}" height="${he.toFixed(1)}" rx="3">
                    <title>${esc(m.label)} expenses: ${esc(formatShort(m.expense))}</title></rect>
                <text class="chart-label" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.label)}</text>
            </g>`;
    }).join("");

    return `
        <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses by month">
            <line class="chart-axis" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"></line>
            <text class="chart-label" x="${left}" y="${top - 3}">${esc(formatShort(max))}</text>
            ${bars}
        </svg>
        <div class="trend-legend">
            <span><i class="dot income-dot"></i> Income</span>
            <span><i class="dot expense-dot"></i> Expenses</span>
        </div>`;
}
