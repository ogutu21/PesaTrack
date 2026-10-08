// Date maths for recurring transactions. Pure functions, no imports.
const pad = n => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const daysIn = (y, m) => new Date(y, m, 0).getDate();

function addDays(date, n) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The k-th occurrence (k = 0 is the start date). Month/year steps keep the original
// day where possible and clamp to the month's length (31 Jan -> 28 Feb -> 31 Mar).
export function dateAt(r, k) {
    const [y, m, d] = r.startDate.split("-").map(Number);
    if (r.frequency === "weekly") return addDays(r.startDate, 7 * k);
    if (r.frequency === "yearly") return ymd(y + k, m, Math.min(d, daysIn(y + k, m)));
    const mm = m - 1 + k, yy = y + Math.floor(mm / 12), mo = (mm % 12) + 1;
    return ymd(yy, mo, Math.min(d, daysIn(yy, mo)));
}

// Occurrences after `after` (exclusive, or null for all) up to `upTo` (inclusive).
export function occurrences(r, after, upTo) {
    const out = [];
    for (let k = 0; k < 1000; k++) {
        const date = dateAt(r, k);
        if (date > upTo) break;
        if (!after || date > after) out.push(date);
    }
    return out;
}

export function nextOccurrence(r, today) {
    for (let k = 0; k < 1000; k++) {
        const date = dateAt(r, k);
        if (date > today) return date;
    }
    return null;
}
