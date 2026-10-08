// Shared households: create or join one, switch between Personal and a household, manage members.
import {
    subscribeMyHouseholds, saveMyHouseholds, subscribeHousehold, getHousehold,
    createHousehold, joinHousehold, removeHouseholdMember, rotateInvite
} from "./firestore.js";

export function initHousehold(c) {
    const esc = c.escapeHTML;
    let list = [], hh = null, unList = null, unHh = null, restored = false;
    const me = () => c.getUser();
    const name = () => me()?.displayName || (me()?.email || "Member").split("@")[0];

    function persist(items) { list = items; return saveMyHouseholds(me().uid, items); }

    function watchActive() {
        if (unHh) { unHh(); unHh = null; }
        hh = null;
        const ws = c.getWorkspace();
        if (!ws.id) return render();
        unHh = subscribeHousehold(ws.id, doc => { hh = doc; render(); }, err => {
            if (err?.code === "permission-denied") lost(ws);
            else console.error("Household sync error:", err);
        });
    }
    async function lost(ws) {
        c.toast(`You're no longer a member of “${ws.name}”. Switched to your personal space.`, "error");
        await persist(list.filter(h => h.id !== ws.id));
        c.switchWorkspace(null);
    }

    function render() {
        const ws = c.getWorkspace(), sel = c.$("workspaceSelect");
        sel.hidden = list.length === 0;
        sel.innerHTML = `<option value="personal">👤 Personal</option>` + list.map(h => `<option value="${esc(h.id)}">🏠 ${esc(h.name)}</option>`).join("");
        sel.value = ws.id && list.some(h => h.id === ws.id) ? ws.id : "personal";

        const body = c.$("householdBody");
        if (!body) return;
        const mine = me();
        const rows = list.map(h => `<div class="lock-status"><span>🏠 ${esc(h.name)}${ws.id === h.id ? " <small class='muted'>(open)</small>" : ""}</span>
            <span>${ws.id === h.id ? "" : `<button type="button" class="link-button" data-hh="open" data-id="${esc(h.id)}">Open</button>`}</span></div>`).join("");
        let detail = "";
        if (ws.id && hh && mine) {
            const isOwner = hh.ownerId === mine.uid;
            detail = `<h4 class="hh-title">Members of ${esc(hh.name)}</h4>
                ${Object.entries(hh.members || {}).map(([uid, m]) => `<div class="lock-status"><span>${esc(m.name || "Member")}${uid === mine.uid ? " (you)" : ""} <small class="muted">${m.role === "owner" ? "Owner" : "Member"}</small></span>
                    ${isOwner && uid !== mine.uid ? `<button type="button" class="link-button danger" data-hh="remove" data-uid="${esc(uid)}">Remove</button>` : ""}</div>`).join("")}
                <label class="ingest-label" for="hhInvite">Invite code</label>
                <div class="ingest-url"><input id="hhInvite" readonly value="${esc(hh.id)}.${esc(hh.inviteSecret || "")}"><button type="button" class="secondary-button" data-hh="copy">Copy</button></div>
                <p class="ingest-note">Anyone with this code can join and see everything in this household.${isOwner ? " Use “New code” to stop the old one working." : ""}</p>
                <div class="heading-actions">${isOwner ? `<button type="button" class="secondary-button" data-hh="rotate">New code</button>` : `<button type="button" class="secondary-button" data-hh="leave">Leave household</button>`}</div>`;
        }
        body.innerHTML = `${list.length ? "" : `<p class="confirm-text">Share a budget with family or a partner. Everyone sees the same transactions, budgets and goals, and your personal data stays private.</p>`}
            ${rows}
            <div class="heading-actions hh-actions"><button type="button" class="primary-button" data-hh="create">Create a household</button>
                <button type="button" class="secondary-button" data-hh="join">Join with a code</button></div>${detail}`;
    }

    function ask(title, note, label, placeholder, submit) {
        return new Promise(resolve => {
            const { overlay, close } = c.openOverlay(`<h3>${esc(title)}</h3><p class="confirm-text">${esc(note)}</p>
                <form><div class="form-group"><label>${esc(label)}</label><input id="hhInput" required maxlength="80" placeholder="${esc(placeholder)}" autocomplete="off"></div>
                <div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">${esc(submit)}</button></div></form>`);
            overlay.querySelector("form").addEventListener("submit", e => { e.preventDefault(); close(); resolve(overlay.querySelector("#hhInput").value.trim()); });
            overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-close]")) resolve(null); });
            overlay.querySelector("#hhInput").focus();
        });
    }

    async function create() {
        const hname = await ask("Create a household", "Give it a name everyone will recognise.", "Household name", "e.g. Home budget", "Create");
        if (!hname) return;
        try {
            const h = await createHousehold(me().uid, hname.slice(0, 40), name());
            await persist([...list, { id: h.id, name: h.name }]);
            c.toast("Household created. Share the invite code with the others.", "success");
            c.switchWorkspace(h.id, h.name);
        } catch (e) { console.error(e); c.toast("Couldn't create the household. Please try again.", "error"); }
    }

    async function join() {
        const code = await ask("Join a household", "Paste the invite code someone shared with you.", "Invite code", "Paste code here", "Join");
        if (!code) return;
        const [hid, secret] = code.trim().split(".");
        if (!hid || !secret || hid.length < 8 || secret.length < 8) return c.toast("That doesn't look like an invite code.", "error");
        if (list.some(h => h.id === hid)) return c.toast("You're already in that household.");
        try {
            await joinHousehold(me().uid, hid, secret, name());
            const doc = await getHousehold(hid);
            await persist([...list, { id: hid, name: doc?.name || "Household" }]);
            c.toast(`Joined “${doc?.name || "household"}”`, "success");
            c.switchWorkspace(hid, doc?.name || "Household");
        } catch (e) {
            console.error(e);
            c.toast("That invite code isn't valid, or it has been replaced. Ask for a new one.", "error");
        }
    }

    c.$("householdCard").addEventListener("click", async e => {
        const b = e.target.closest("[data-hh]");
        if (!b || !me()) return;
        const act = b.dataset.hh, ws = c.getWorkspace();
        if (act === "create") create();
        if (act === "join") join();
        if (act === "open") { const h = list.find(x => x.id === b.dataset.id); if (h) c.switchWorkspace(h.id, h.name); }
        if (act === "copy") { try { await navigator.clipboard.writeText(c.$("hhInvite").value); c.toast("Invite code copied", "success"); } catch { c.$("hhInvite").select(); c.toast("Copy the code from the box"); } }
        if (act === "rotate" && await c.confirmDialog("Create a new invite code? The old one will stop working.", "New code")) {
            rotateInvite(ws.id).then(() => c.toast("New invite code created", "success")).catch(() => c.toast("Couldn't change the code.", "error"));
        }
        if (act === "remove" && await c.confirmDialog("Remove this person from the household?", "Remove")) {
            removeHouseholdMember(ws.id, b.dataset.uid).then(() => c.toast("Member removed", "success")).catch(() => c.toast("Couldn't remove the member.", "error"));
        }
        if (act === "leave" && await c.confirmDialog(`Leave “${ws.name}”? You'll lose access to its data.`, "Leave")) {
            try { await removeHouseholdMember(ws.id, me().uid); await persist(list.filter(h => h.id !== ws.id)); c.toast("You left the household", "success"); c.switchWorkspace(null); }
            catch { c.toast("Couldn't leave the household.", "error"); }
        }
    });
    c.$("workspaceSelect").addEventListener("change", e => {
        const h = list.find(x => x.id === e.target.value);
        c.switchWorkspace(h ? h.id : null, h?.name);
    });

    return {
        onUser(u) {
            if (unList) { unList(); unList = null; }
            if (unHh) { unHh(); unHh = null; }
            list = []; hh = null; restored = false;
            if (!u) return;
            unList = subscribeMyHouseholds(u.uid, items => {
                list = items;
                if (!restored) {   // reopen the household you were last using
                    restored = true;
                    const saved = localStorage.getItem(`pesatrack_ws_${u.uid}`);
                    const h = saved && list.find(x => x.id === saved);
                    if (h && c.getWorkspace().id !== h.id) return c.switchWorkspace(h.id, h.name);
                }
                render();
            }, err => console.error("Household list error:", err));
        },
        refresh: watchActive
    };
}
