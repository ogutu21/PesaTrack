// Home screen extras: "needs a category" review, M-Pesa fee breakdown, spending changes in words, and a hide-amounts button.
import { reviewList, topCategories, feeBreakdown, sentences } from "./extras-core.js";

const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

export function initExtras(c) {
    const esc = c.escapeHTML, fmt = c.formatCurrency, $ = c.$;
    const SKIP_KEY = "pt_review_skip", HIDE_KEY = "pt_hide_amounts";
    let reviewCard = null, stack = null, busy = false;

    const skipped = () => { try { return new Set(JSON.parse(localStorage.getItem(SKIP_KEY) || "[]")); } catch { return new Set(); } };
    const skip = id => { try { localStorage.setItem(SKIP_KEY, JSON.stringify([...skipped(), id].slice(-500))); } catch {} };

    // ---------- hide amounts ----------
    function setupPrivacy() {
        const theme = $("themeButton");
        if (!theme || $("privacyButton")) return;
        const btn = document.createElement("button");
        btn.id = "privacyButton"; btn.type = "button"; btn.className = theme.className;
        const apply = on => { document.body.classList.toggle("hide-amounts", on); btn.setAttribute("aria-pressed", String(on)); btn.setAttribute("aria-label", on ? "Show amounts" : "Hide amounts"); btn.title = btn.getAttribute("aria-label"); btn.innerHTML = on ? EYE_OFF : EYE; };
        let on = false; try { on = localStorage.getItem(HIDE_KEY) === "1"; } catch {}
        apply(on);
        btn.addEventListener("click", () => { on = !on; apply(on); try { localStorage.setItem(HIDE_KEY, on ? "1" : "0"); } catch {} });
        theme.before(btn);
    }

    // ---------- needs a category ----------
    function renderReview() {
        const anchor = $("attention"); if (!anchor) return;
        if (!reviewCard || !reviewCard.isConnected) {
            reviewCard = document.createElement("section");
            reviewCard.className = "xcard review-card"; reviewCard.id = "reviewCard"; reviewCard.hidden = true;
            reviewCard.addEventListener("click", onReviewClick);
            reviewCard.addEventListener("change", onReviewMore);
            anchor.after(reviewCard);
        }
        const all = c.getAll(), list = reviewList(all, skipped());
        reviewCard.hidden = !list.length;
        if (!list.length) return;
        const t = list[0];
        const names = c.categoriesFor(t.type).map(x => x.name).filter(n => n !== "Other");
        const quick = topCategories(all, t.type).filter(n => names.includes(n));
        for (const n of names) { if (quick.length >= 5) break; if (!quick.includes(n)) quick.push(n); }
        const rest = names.filter(n => !quick.includes(n));
        reviewCard.dataset.id = t.id;
        reviewCard.innerHTML = `
            <div class="xhead"><h3>Needs a category</h3><small>${list.length} left</small></div>
            <p class="review-item"><strong>${esc(t.description)}</strong><span class="review-amt">${esc(fmt(t.amount))}${t.date ? " · " + esc(c.formatDate(t.date)) : ""}</span></p>
            <div class="review-chips" role="group" aria-label="Choose a category">
                ${quick.map(n => `<button type="button" class="chip" data-cat="${esc(n)}">${esc(n)}</button>`).join("")}
                ${rest.length ? `<select class="chip-more" aria-label="More categories"><option value="">More…</option>${rest.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>` : ""}
            </div>
            <div class="xactions"><button type="button" class="secondary-button" data-skip>Skip for now</button></div>`;
    }

    function file(id, category) {
        if (busy) return; busy = true; setTimeout(() => { busy = false; }, 500);
        const tx = c.getAll().find(t => t.id === id); if (!tx) return;
        c.saveTx({ ...tx, category });
        c.toast(`Filed under ${category}`, "success");
    }
    function onReviewClick(e) {
        const id = reviewCard.dataset.id;
        const chip = e.target.closest("[data-cat]");
        if (chip) return file(id, chip.dataset.cat);
        if (e.target.closest("[data-skip]")) { skip(id); renderReview(); }
    }
    function onReviewMore(e) { if (e.target.matches(".chip-more") && e.target.value) file(reviewCard.dataset.id, e.target.value); }

    // ---------- fees, and spending changes in words ----------
    function ensureStack() {
        const qa = $("quickActions"); if (!qa) return null;
        if (!stack || !stack.isConnected) { stack = document.createElement("div"); stack.id = "extrasStack"; qa.after(stack); }
        return stack;
    }

    function feesHTML() {
        const month = c.getMonth() === "all" ? null : c.getMonth();
        const f = feeBreakdown(c.getAll(), month);
        if (!(f.total > 0)) return "";
        const pct = f.share >= 0.005 ? `, about ${f.share < 0.1 ? (f.share * 100).toFixed(1).replace(/\.0$/, "") : Math.round(f.share * 100)}% of what you spent` : "";
        return `<section class="xcard fees-card" aria-label="M-Pesa fees">
            <div class="xhead"><h3>M-Pesa fees</h3><strong>${esc(fmt(f.total))}</strong></div>
            <p class="xnote">${esc(month ? c.monthLabel(month) : "All time")}: ${f.count} charge${f.count === 1 ? "" : "s"}${pct}.</p>
            <div class="fee-rows">${f.groups.map(g => `<div class="fee-row"><span>${esc(g.label)} <small>${g.count}×</small></span><span class="fee-amt">${esc(fmt(g.total))}</span></div>`).join("")}</div>
        </section>`;
    }

    function wordsHTML() {
        const month = c.localToday().slice(0, 7), prev = c.shiftMonth(month, -1);
        const list = sentences(c.getAll(), { month, prev, prevName: c.monthLabel(prev), today: c.localToday(), fmt });
        if (!list.length) return "";
        return `<section class="xcard words-card" aria-label="Worth a look"><div class="xhead"><h3>Worth a look</h3></div>${list.map(s => `<p class="xnote words-line">${esc(s)}</p>`).join("")}</section>`;
    }

    function render() {
        setupPrivacy();
        renderReview();
        const box = ensureStack();
        if (box) box.innerHTML = feesHTML() + wordsHTML();
    }

    return { render };
}
