// Dependency-free SVG charts. Pure functions that return HTML strings.

import { colorFor } from "./categories.js";

let trendN = 0, sparkN = 0;
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
    const uid = ++trendN;
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
                <rect class="bar-income" style="fill:url(#gi${uid})" x="${(cx - barW - 1).toFixed(1)}" y="${(top + plotH - hi).toFixed(1)}" width="${barW.toFixed(1)}" height="${hi.toFixed(1)}" rx="3">
                    <title>${esc(m.label)} income: ${esc(formatShort(m.income))}</title></rect>
                <rect class="bar-expense" style="fill:url(#ge${uid})" x="${(cx + 1).toFixed(1)}" y="${(top + plotH - he).toFixed(1)}" width="${barW.toFixed(1)}" height="${he.toFixed(1)}" rx="3">
                    <title>${esc(m.label)} expenses: ${esc(formatShort(m.expense))}</title></rect>
                <text class="chart-label" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.label)}</text>
            </g>`;
    }).join("");

    return `
        <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses by month">
            <defs><linearGradient id="gi${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ddc97"/><stop offset="1" stop-color="#1f9d6a"/></linearGradient>
            <linearGradient id="ge${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a70"/><stop offset="1" stop-color="#d6483c"/></linearGradient></defs>
            <line class="chart-axis" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"></line>
            <text class="chart-label" x="${left}" y="${top - 3}">${esc(formatShort(max))}</text>
            ${bars}
        </svg>
        <div class="trend-legend">
            <span><i class="dot income-dot"></i> Income</span>
            <span><i class="dot expense-dot"></i> Expenses</span>
        </div>`;
}

// A small glowing area chart for stat cards.
export function sparkHTML(values, color = "#a99bff") {
    if (!values || values.length < 2) return "";
    const W = 200, H = 60, pad = 4, n = values.length;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [pad + ((W - 2 * pad) * i) / (n - 1), pad + (H - 2 * pad) * (1 - (v - min) / span) * 0.85 + 6]);
    const f = x => x.toFixed(1);
    const line = pts.map(([x, y], i, a) => i ? `C${f((a[i - 1][0] + x) / 2)} ${f(a[i - 1][1])} ${f((a[i - 1][0] + x) / 2)} ${f(y)} ${f(x)} ${f(y)}` : `M${f(x)} ${f(y)}`).join(" ");
    const area = `${line} L${f(pts[n - 1][0])} ${H} L${f(pts[0][0])} ${H} Z`;
    const id = `sp${++sparkN}`;
    return `<svg class="spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.42"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#${id})"/>
        <path class="spark-line" d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1" vector-effect="non-scaling-stroke"/></svg>`;
}
