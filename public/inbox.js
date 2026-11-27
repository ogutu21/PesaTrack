// Automatic M-Pesa capture.
// A phone automation app (MacroDroid, Tasker, iOS Shortcuts) posts each M-Pesa SMS into users/{uid}/inbox,
// signed with a private key that only you can see. Here we read that inbox, add the transactions, and tidy up.
import { app, db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { processInbox, addedMessage } from "./inbox-core.js";

const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");

export function initInbox({ $, toast, escapeHTML: esc, confirmDialog }) {
    let uid = null, unsub = null, busy = false, secret = null, card = null;

    const settingsRef = () => doc(db, "users", uid, "settings", "ingest");
    const personalTx = id => doc(db, "users", uid, "transactions", String(id));

    // ---------- reading the inbox ----------
    let queued = null;
    async function handle(docs) {
        if (busy) { queued = docs; return; }
        busy = true;
        try {
            const r = await processInbox(docs, {
                exists: async id => (await getDoc(personalTx(id))).exists(),
                save: tx => setDoc(personalTx(tx.id), tx),
                saveTransfer: async t => {   // savings balance: keep whichever message is newest
                    const ref = doc(db, "users", uid, "savings", t.account);
                    const cur = await getDoc(ref);
                    if (cur.exists() && String(cur.data().asOf || "") > t.asOf) return;
                    await setDoc(ref, { balance: t.balance, asOf: t.asOf, lastAmount: t.amount, lastDir: t.dir, lastDate: t.date, ...(t.due ? { due: t.due } : {}), ...(t.limit != null ? { limit: t.limit } : {}), updatedAt: new Date().toISOString() });
                },
                payees: async () => { const s = await getDoc(doc(db, "users", uid, "settings", "payees")); return s.exists() ? (s.data().map || {}) : {}; },
                remove: id => deleteDoc(doc(db, "users", uid, "inbox", id))
            });
            if (r.added) toast(`${addedMessage(r)} (in your personal space)`, "success");
            if (r.transfers) toast("Savings balance updated", "success");
        } catch (e) { console.warn("Inbox:", e); }
        busy = false;
        if (queued) { const next = queued; queued = null; handle(next); }
    }
    function start() {
        unsub = onSnapshot(collection(db, "users", uid, "inbox"),
            snap => { const docs = snap.docs.map(d => ({ id: d.id, text: d.data().text })); if (docs.length) handle(docs); },
            e => console.warn("Inbox sync:", e));
    }
    function stop() { if (unsub) unsub(); unsub = null; }

    // ---------- Settings card ----------
    function ensureCard() {
        if (card && card.isConnected) return card;
        const lock = $("lockCard"), host = $("settings");
        if (!host) return null;
        card = document.createElement("div");
        card.className = "card ingest-card"; card.id = "autoCaptureCard";
        card.addEventListener("click", onCardClick);
        lock ? lock.before(card) : host.append(card);
        return card;
    }
    const endpoint = () =>
        `https://firestore.googleapis.com/v1/projects/${app.options.projectId}/databases/(default)/documents/users/${uid}/inbox?key=${app.options.apiKey}`;
    const bodyFor = token => `{"fields":{"text":{"stringValue":"${token}"},"secret":{"stringValue":"${secret}"}}}`;
    const row = (label, value, id) => `<label class="ingest-label" for="${id}">${esc(label)}</label>
        <div class="ingest-url"><input id="${id}" readonly value="${esc(value)}"><button type="button" class="secondary-button" data-copy="${id}">Copy</button></div>`;

    // capture-setup-v1: what this phone still needs, from the app itself
    const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
    const optedOut = () => { try { return localStorage.getItem("pt_ac_off_" + uid) === "1"; } catch { return false; } };
    function statusHtml() {
        let st = null;
        try { st = JSON.parse(PesaTrackApp.status()); } catch {}
        if (!st || st.sms === undefined) return `<p class="ingest-note"><strong>On.</strong> This phone sends each new M-Pesa message to PesaTrack by itself.</p>`;   // older app without the checks
        const btn = (a, label) => `<button type="button" class="secondary-button" data-ac="${a}">${label}</button>`;
        const item = (ok, label, help, actions) => `<li class="cap-item ${ok ? "ok" : "bad"}"><span class="cap-mark">${ok ? "✓" : "!"}</span><div><strong>${label}</strong>${ok ? "" : `<p>${help}</p><div class="heading-actions">${actions}</div>`}</div></li>`;
        const linked = !!(st.signedIn && st.configured), working = st.sms && linked;
        const last = st.lastSms ? `Last M-Pesa message on this phone: ${ago(st.lastSms)}${st.lastResult ? ", " + esc(st.lastResult) : ""}.` : "No M-Pesa message has reached this phone yet.";
        return `<p class="ingest-note"><strong>${working ? "On." : "Not working yet."}</strong> ${working ? "New M-Pesa messages are added automatically." : "Fix the items marked ! below."}</p>
            <ul class="cap-list">
                ${item(st.sms, "Reading M-Pesa messages", "PesaTrack isn't allowed to read SMS yet. Tap Allow. If nothing happens, open app settings, tap the ⋮ menu and choose Allow restricted settings, then go to Permissions and allow SMS.", btn("sms", "Allow") + btn("appsettings", "Open app settings"))}
                ${item(linked, "Connected to your account", "This phone hasn't received your sign-in yet. Sign out and sign in again, then check here.", btn("refresh", "Check again"))}
                ${item(st.notify, "Notifications", "Allow notifications to see each transaction as it is captured.", btn("appsettings", "Open app settings"))}
                ${item(st.battery, "Runs in the background", "Some phones stop apps that aren't open. Allow PesaTrack to run in the background. On Tecno, Infinix, Xiaomi, Oppo and Samsung phones also switch on Autostart or lock the app in recent apps.", btn("battery", "Allow"))}
            </ul><p class="ingest-note">${last}</p>`;
    }

    async function render() {
        const el = ensureCard(); if (!el || !uid) return;
        try { const s = await getDoc(settingsRef()); secret = s.exists() ? s.data().secret : null; } catch { secret = null; }
        if (!secret && window.PesaTrackApp && !optedOut()) {   // in the app, capture turns itself on: nothing to set up by hand
            try { const fresh = hex(24); await setDoc(settingsRef(), { secret: fresh, updatedAt: new Date().toISOString() }); secret = fresh; } catch (e) { console.warn("Auto-setup:", e); }
        }
        const inApp = !!window.PesaTrackApp;
        try { if (inApp) { if (secret) { PesaTrackApp.saveConfig(uid, app.options.apiKey, secret, app.options.projectId); if (auth.currentUser && PesaTrackApp.saveAuth) PesaTrackApp.saveAuth(auth.currentUser.refreshToken); } else PesaTrackApp.clearConfig(); } } catch {}
        const head = `<div class="card-header"><div><h3>Automatic M-Pesa capture</h3><p>Add transactions as soon as the M-Pesa SMS arrives.</p></div></div>`;
        if (!secret) {
            el.innerHTML = inApp
                ? `${head}<p class="ingest-note"><strong>Off.</strong> Turn on to add transactions from your M-Pesa messages as they arrive.</p>
                    <div class="heading-actions"><button type="button" class="primary-button" data-ac="on">Turn on</button></div>`
                : `${head}<p class="ingest-note">A free automation app on your phone sends each M-Pesa message to your private PesaTrack inbox. PesaTrack adds it the next time you open the app, or straight away if it's open.</p>
                <div class="heading-actions"><button type="button" class="primary-button" data-ac="on">Turn on</button></div>`;
            return;
        }
        if (inApp) {
            el.innerHTML = `${head}
                ${statusHtml()}
                <div class="heading-actions"><button type="button" class="secondary-button" data-ac="off">Turn off</button></div>`;
            return;
        }
        el.innerHTML = `${head}
            <p class="ingest-note"><strong>On.</strong> Set up your phone once with the steps below. Keep the key private: anyone who has it can add messages to your inbox.</p>
            <ol class="ingest-note"><li>Install <strong>MacroDroid</strong> (or Tasker) on your phone.</li>
                <li>Trigger: <em>SMS received</em>, from <strong>MPESA</strong>.</li>
                <li>Action: <em>HTTP request</em>, method <strong>POST</strong>, content type <strong>application/json</strong>, with the address and body below.</li>
                <li>Add the header <strong>Referer</strong> = <strong>https://${esc(app.options.projectId)}.web.app/</strong>.</li></ol>
            ${row("Address", endpoint(), "acUrl")}
            ${row("Body (MacroDroid)", bodyFor("[sms_message]"), "acBody")}
            <p class="ingest-note">In Tasker, use <strong>%SMSRB</strong> instead of <strong>[sms_message]</strong>. If a message ever contains a double quote, replace it with a single quote first.</p>
            <div class="heading-actions"><button type="button" class="secondary-button" data-ac="rotate">New key</button>
                <button type="button" class="secondary-button" data-ac="off">Turn off</button></div>`;
    }

    async function onCardClick(e) {
        const copy = e.target.closest("[data-copy]");
        if (copy) {
            const input = card.querySelector("#" + copy.dataset.copy);
            try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand("copy"); }
            toast("Copied", "success"); return;
        }
        const b = e.target.closest("[data-ac]"); if (!b) return;
        const act = b.dataset.ac;
        if (act === "sms" || act === "appsettings" || act === "battery") {
            try { act === "sms" ? PesaTrackApp.requestSms() : act === "battery" ? PesaTrackApp.openBatterySettings() : PesaTrackApp.openAppSettings(); } catch {}
            return;
        }
        if (act === "refresh") { await render(); return; }
        try {
            if (b.dataset.ac === "on" || b.dataset.ac === "rotate") {
                if (b.dataset.ac === "rotate" && !(await confirmDialog("Make a new key? The one on your phone will stop working until you update it.", "New key"))) return;
                try { localStorage.removeItem("pt_ac_off_" + uid); } catch {}
                await setDoc(settingsRef(), { secret: hex(24), updatedAt: new Date().toISOString() });
            } else if (b.dataset.ac === "off") {
                if (!(await confirmDialog("Turn off automatic capture? Messages sent from your phone will be refused.", "Turn off"))) return;
                await deleteDoc(settingsRef());
                try { localStorage.setItem("pt_ac_off_" + uid, "1"); } catch {}   // stays off until you turn it on
            }
            await render();
        } catch (err) { console.error(err); toast("Couldn't save that. Check your connection and try again.", "error"); }
    }

    // the app tells the page when permissions change or you come back from phone settings
    const refresh = () => { if (uid && window.PesaTrackApp) render(); };
    window.addEventListener("pesatrack-status", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

    return {
        onUser(user) {
            stop(); uid = user ? user.uid : null; secret = null;
            if (!uid) { try { window.PesaTrackApp && PesaTrackApp.clearConfig(); } catch {} return; }
            start(); render();
        }
    };
}
