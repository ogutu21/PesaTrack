// Home screen extras: money out by person, M-Pesa fee breakdown, spending changes in words, a hide-amounts button,
// and a one-time tidy-up that moves older M-Pesa "Other" entries into Send Money / Buy Goods / Pay Bill / Withdrawals / Money Received.
import { otherList, regroupCategory, peopleOut, feeBreakdown, sentences } from "./extras-core.js";

const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

export function initExtras(c) {
    const esc = c.escapeHTML, fmt = c.formatCurrency, $ = c.$;
    const TIDY_KEY = "pt_regroup_done", HIDE_KEY = "pt_hide_amounts";
    let peopleCard = null, stack = null, query = "", showAll = false, tidying = false;

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

    // ---------- older "Other" entries -> M-Pesa groups (each entry is tried once) ----------
    function tidy() {
        if (tidying) return;
        let done; try { done = new Set(JSON.parse(localStorage.getItem(TIDY_KEY) || "[]")); } catch { done = new Set(); }
        const todo = otherList(c.getAll()).filter(t => !done.has(t.id)).slice(0, 300);
        if (!todo.length) return;
        tidying = true;
        for (const t of todo) {
            done.add(t.id);
            const category = regroupCategory(t);
            if (category) c.saveTx({ ...t, category });
        }
        try { localStorage.setItem(TIDY_KEY, JSON.stringify([...done].slice(-3000))); } catch {}
        setTimeout(() => { tidying = false; }, 3000);
    }

    // ---------- money out by person ----------
    function renderPeople() {
        const anchor = $("quickActions"); if (!anchor) return;
        if (!peopleCard || !peopleCard.isConnected) {
            peopleCard = document.createElement("section");
            peopleCard.className = "xcard people-card"; peopleCard.id = "peopleCard"; peopleCard.hidden = true;
            peopleCard.innerHTML = `<div class="xhead"><h3>Money out by person</h3><small id="peopleCount"></small></div>
                <input id="peopleSearch" class="people-search" type="search" placeholder="Search by name" aria-label="Search by name" autocomplete="off">
                <div id="peopleList" class="people-list"></div>
                <button type="button" id="peopleMore" class="secondary-button people-more" hidden></button>`;
            peopleCard.addEventListener("input", e => { if (e.target.id === "peopleSearch") { query = e.target.value.trim().toLowerCase(); renderPeopleList(); } });
            peopleCard.addEventListener("click", e => { if (e.target.id === "peopleMore") { showAll = !showAll; renderPeopleList(); } });
            anchor.after(peopleCard);
        }
        renderPeopleList();
    }

    function renderPeopleList() {
        if (!peopleCard) return;
        const month = c.getMonth() === "all" ? null : c.getMonth();
        const all = peopleOut(c.getAll(), month);
        peopleCard.hidden = !all.length;
        if (!all.length) return;
        const rows = query ? all.filter(p => p.name.toLowerCase().includes(query)) : all;
        const shown = query || showAll ? rows : rows.slice(0, 6);
        peopleCard.querySelector("#peopleCount").textContent = `${all.length} ${all.length === 1 ? "name" : "names"} · ${month ? c.monthLabel(month) : "All time"}`;
        peopleCard.querySelector("#peopleList").innerHTML = shown.length
            ? shown.map(p => `<div class="people-row"><span class="people-name">${esc(p.name)}<small>${p.count}×</small></span><span class="people-amt">${esc(fmt(p.total))}</span></div>`).join("")
            : `<p class="xnote">No one with that name.</p>`;
        const more = peopleCard.querySelector("#peopleMore");
        more.hidden = !!query || rows.length <= 6;
        more.textContent = showAll ? "Show fewer" : `Show all ${rows.length}`;
    }

    // ---------- fees, and spending changes in words ----------
    function ensureStack() {
        const qa = $("quickActions"); if (!qa) return null;
        if (!stack || !stack.isConnected) { stack = document.createElement("div"); stack.id = "extrasStack"; (peopleCard && peopleCard.isConnected ? peopleCard : qa).after(stack); }
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
        tidy();
        renderPeople();
        const box = ensureStack();
        if (box) box.innerHTML = feesHTML() + wordsHTML();
    }

    return { render };
}
