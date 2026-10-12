// Automatic M-Pesa on the free plan.
// The phone (MacroDroid / Shortcuts) drops each new M-Pesa SMS into an inbox in the user's account.
// This module watches that inbox, turns messages into transactions, and clears them.
import { firebaseConfig } from "./firebase-config.js";
import {
    subscribeIngestKey, saveIngestKey, deleteIngestKey, subscribeInbox, deleteInboxItem, importPersonalTransactions
} from "./firestore.js";
import { parseMpesa } from "./mpesa.js";

const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");

export function initAutoImport(c) {
    const esc = c.escapeHTML;
    let user = null, key = null, pending = 0, unKey = null, unInbox = null, processing = false;
    const handled = new Set();

    const url = () => `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${user.uid}/inbox?key=${firebaseConfig.apiKey}`;
    const body = text => JSON.stringify({ fields: { secret: { stringValue: key.secret }, text: { stringValue: text } } });
    const SAMPLE = "TEST123456 Confirmed. Ksh10.00 paid to TEST SHOP. on 1/1/26 at 9:00 AM. New M-PESA balance is Ksh100.00. Transaction cost, Ksh0.00.";

    async function process(items) {
        pending = items.length;
        render();
        if (!items.length || processing || !user) return;
        processing = true;
        const uid = user.uid;
        try {
            const txs = [], done = [];
            let ignored = 0;
            const now = new Date().toISOString();
            for (const it of items.slice(0, 50)) {
                if (handled.has(it.id)) continue;
                handled.add(it.id);
                const { items: found } = parseMpesa(String(it.text || ""));
                if (!found.length) ignored++;
                for (const p of found) {
                    txs.push({ id: p.id, description: p.description, amount: p.amount, type: p.type, category: p.category, date: p.date, tags: ["mpesa"], createdAt: now });
                    if (key?.recordFees !== false && p.fee > 0) {
                        txs.push({ id: `${p.id}-fee`, description: `M-Pesa fee (${p.code || "SMS"})`, amount: p.fee, type: "expense", category: "Fees & Charges", date: p.date, tags: ["mpesa"], createdAt: now });
                    }
                }
                done.push(it.id);
            }
            if (txs.length) await importPersonalTransactions(uid, txs);
            await Promise.all(done.map(id => deleteInboxItem(uid, id)));
            if (txs.length) c.toast(`Added ${txs.length} transaction${txs.length === 1 ? "" : "s"} from your M-Pesa messages${c.inHousehold() ? " (to your personal space)" : ""}`, "success");
            else if (ignored) c.toast(`${ignored} forwarded message${ignored === 1 ? "" : "s"} weren't M-Pesa transactions and were ignored`);
        } catch (e) {
            console.error("Inbox processing failed:", e);
            handled.clear();   // try again on the next update
        } finally { processing = false; }
    }

    function field(label, value, id) {
        return `<label class="ingest-label" for="${id}">${label}</label>
            <div class="ingest-url"><input id="${id}" readonly value="${esc(value)}"><button type="button" class="secondary-button" data-auto="copy" data-for="${id}">Copy</button></div>`;
    }

    function render() {
        const box = c.$("autoBody");
        if (!box || !user) return;
        if (!key) {
            box.innerHTML = `<p class="confirm-text">Off. Turn it on and your phone can send each new M-Pesa message to your account, so transactions appear by themselves. Works on the free plan.</p>
                <button type="button" class="primary-button" data-auto="on">Turn on</button>`;
            return;
        }
        const macro = body("[sms_message]");
        const test = `Invoke-RestMethod -Method Post -Uri "${url()}" -ContentType "application/json" -Body '${body(SAMPLE)}'`;
        box.innerHTML = `
            ${pending ? `<p class="mp-note">${pending} message${pending === 1 ? "" : "s"} waiting to be added…</p>` : ""}
            ${field("1. Web address (URL)", url(), "autoUrl")}
            ${field("2. Request body (JSON)", macro, "autoBody2")}
            <label class="mp-fee"><input type="checkbox" data-auto="fees" ${key.recordFees !== false ? "checked" : ""}> Record M-Pesa fees as separate expenses</label>
            <div class="heading-actions"><button type="button" class="secondary-button" data-auto="rotate">New key</button>
                <button type="button" class="secondary-button" data-auto="off">Turn off</button></div>
            <details class="guide"><summary>Set up on Android (MacroDroid)</summary><ol>
                <li>Install <strong>MacroDroid</strong> and add a new macro.</li>
                <li>Trigger: <strong>SMS Received</strong>, sender <strong>MPESA</strong>.</li>
                <li>Action: <strong>HTTP Request</strong>. Method <strong>POST</strong>, content type <strong>application/json</strong>.</li>
                <li>Paste box 1 as the URL and box 2 as the body. In box 2, <code>[sms_message]</code> is MacroDroid's variable for the message text.</li>
                <li>Allow MacroDroid to run in the background (turn off battery optimisation for it).</li></ol></details>
            <details class="guide"><summary>Set up on iPhone (Shortcuts)</summary><ol>
                <li><strong>Shortcuts → Automation → New Automation → Message</strong>. Choose <strong>Message Contains: Confirmed</strong>, then <strong>Run Immediately</strong>.</li>
                <li>Add <strong>Get Contents of URL</strong>. URL = box 1. Method = <strong>POST</strong>. Request Body = <strong>JSON</strong>.</li>
                <li>Build the JSON as in box 2: a <code>fields</code> dictionary holding <code>secret</code> and <code>text</code>, each a dictionary with one <code>stringValue</code> item. Set the text's <code>stringValue</code> to <strong>Shortcut Input</strong>.</li>
                <li>Turn off <strong>Notify When Run</strong>. Menu names vary a little between iOS versions.</li></ol></details>
            <details class="guide"><summary>Test it from your computer first</summary>
                <p class="ingest-note">Run this in PowerShell. It adds a sample Ksh 10 transaction called “TEST SHOP” (delete it afterwards). If it works, your phone setup will too.</p>
                ${field("PowerShell command", test, "autoTest")}</details>
            <p class="ingest-note">Keep this key private: anyone who has it can add messages to your inbox. Use “New key” if it leaks. A message containing a double quote or a line break can make the phone's request fail. It stays on your phone, so you can still import it later from a backup. The inbox is read when you open PesaTrack.</p>`;
    }

    c.$("autoCard").addEventListener("click", async e => {
        const b = e.target.closest("[data-auto]");
        if (!b || !user) return;
        const act = b.dataset.auto;
        if (act === "on") saveIngestKey(user.uid, { secret: hex(32), recordFees: true }).catch(c.reportWriteError);
        if (act === "copy") {
            const input = c.$(b.dataset.for);
            try { await navigator.clipboard.writeText(input.value); c.toast("Copied", "success"); } catch { input.select(); c.toast("Press Copy on your keyboard"); }
        }
        if (act === "rotate" && await c.confirmDialog("Create a new key? The old one stops working and you'll need to update your phone.", "New key"))
            saveIngestKey(user.uid, { secret: hex(32), recordFees: key.recordFees !== false }).then(() => c.toast("New key created. Update your phone.", "success")).catch(c.reportWriteError);
        if (act === "off" && await c.confirmDialog("Turn off automatic M-Pesa? Your phone's requests will stop working.", "Turn off"))
            deleteIngestKey(user.uid).then(() => c.toast("Turned off", "success")).catch(c.reportWriteError);
    });
    c.$("autoCard").addEventListener("change", e => {
        if (e.target.dataset.auto === "fees" && key) saveIngestKey(user.uid, { secret: key.secret, recordFees: e.target.checked }).catch(c.reportWriteError);
    });

    return {
        onUser(u) {
            if (unKey) { unKey(); unKey = null; }
            if (unInbox) { unInbox(); unInbox = null; }
            user = u; key = null; pending = 0; handled.clear();
            if (!u) return;
            unKey = subscribeIngestKey(u.uid, d => { key = d; render(); }, e => console.error("Ingest key error:", e));
            unInbox = subscribeInbox(u.uid, process, e => console.error("Inbox error:", e));
        }
    };
}
