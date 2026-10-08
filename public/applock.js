// App lock: a PIN plus optional fingerprint / face unlock (WebAuthn platform authenticator).
// It is a privacy lock for the screen. Your Firebase login remains the real account security.

const KEY_UID = "pesatrack_lock_uid";                       // account that enabled the lock on this device
const cfgKey = uid => `pesatrack_lock_${uid}`;
const TIMEOUTS = [[0, "Every time I leave the app"], [60, "After 1 minute"], [300, "After 5 minutes"],
    [900, "After 15 minutes"], [-1, "Only when I reopen the app"]];

const enc = new TextEncoder();
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function hashPin(pin, salt, iterations) {
    const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    return toB64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
const loadCfg = uid => { try { return JSON.parse(localStorage.getItem(cfgKey(uid)) || "null"); } catch { return null; } };
const saveCfg = (uid, cfg) => localStorage.setItem(cfgKey(uid), JSON.stringify(cfg));

async function biometricAvailable() {
    try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
}

export function initAppLock({ $, toast, confirmDialog, escapeHTML: esc, logout }) {
    let uid = localStorage.getItem(KEY_UID);        // whose lock is active right now
    let cfg = uid ? loadCfg(uid) : null;
    let locked = false, hiddenAt = 0, entered = "", busy = false, bioBusy = false, timer = null, user = null;

    // ---------- lock screen ----------
    const screen = document.createElement("div");
    screen.id = "lockScreen"; screen.className = "lock-screen"; screen.hidden = true;
    screen.setAttribute("role", "dialog"); screen.setAttribute("aria-modal", "true");
    screen.innerHTML = `
        <div class="lock-box">
            <div class="lock-logo">💰</div>
            <h2>PesaTrack is locked</h2>
            <p id="lockMsg"></p>
            <div id="lockDots" class="lock-dots"></div>
            <div class="lock-pad">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-d="${n}">${n}</button>`).join("")}
                <button type="button" id="lockBio" aria-label="Use fingerprint or face">👆</button>
                <button type="button" data-d="0">0</button>
                <button type="button" id="lockBack" aria-label="Delete">⌫</button>
            </div>
            <button type="button" class="lock-link" id="lockForgot">Forgot PIN? Log out</button>
            <div id="lockLogoutBox" class="lock-logout" hidden>
                <p>Log out and remove the app lock? You'll sign in again with your password.</p>
                <button type="button" class="lock-danger" id="lockLogoutYes">Log out</button>
                <button type="button" class="lock-link" id="lockLogoutNo">Cancel</button>
            </div>
        </div>`;
    document.body.append(screen);
    const msg = (text = "", err = false) => { const m = $("lockMsg") || screen.querySelector("#lockMsg"); m.textContent = text || "Enter your PIN"; m.classList.toggle("err", err); };
    const dots = () => { screen.querySelector("#lockDots").innerHTML = Array.from({ length: cfg?.len || 4 }, (_, i) => `<i class="${i < entered.length ? "on" : ""}"></i>`).join(""); };
    const cooldown = () => Math.max(0, Math.ceil(((cfg?.lockedUntil || 0) - Date.now()) / 1000));
    const setKeys = disabled => screen.querySelectorAll(".lock-pad button").forEach(b => { b.disabled = disabled; });

    function startCooldownUI() {
        clearInterval(timer);
        const tick = () => {
            const left = cooldown();
            if (left > 0) { setKeys(true); msg(`Too many attempts. Try again in ${left}s`, true); }
            else { clearInterval(timer); setKeys(false); msg(); }
        };
        tick();
        if (cooldown() > 0) timer = setInterval(tick, 1000);
    }

    function showLock() {
        if (!cfg) return;
        locked = true; entered = ""; dots();
        screen.hidden = false; screen.querySelector("#lockLogoutBox").hidden = true;
        document.body.classList.add("lock-open");
        document.documentElement.classList.remove("lock-pending");
        screen.querySelector("#lockBio").style.visibility = cfg.credId ? "visible" : "hidden";
        msg(); startCooldownUI();
        if (cfg.credId) setTimeout(() => tryBiometric(true), 250);
    }
    function hideLock() {
        locked = false; entered = ""; screen.hidden = true;
        document.body.classList.remove("lock-open");
        document.documentElement.classList.remove("lock-pending");
    }

    function unlock() { cfg.fails = 0; cfg.lockedUntil = 0; saveCfg(uid, cfg); hideLock(); }

    async function submitPin() {
        busy = true;
        const ok = (await hashPin(entered, fromB64(cfg.salt), cfg.iterations)) === cfg.hash;
        busy = false;
        if (ok) return unlock();
        cfg.fails = (cfg.fails || 0) + 1;
        if (cfg.fails >= 5) cfg.lockedUntil = Date.now() + Math.min(30 * 2 ** (cfg.fails - 5), 900) * 1000;
        saveCfg(uid, cfg);
        entered = ""; dots();
        const d = screen.querySelector("#lockDots");
        d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake");
        if (cooldown() > 0) startCooldownUI(); else msg("Wrong PIN. Try again.", true);
    }
    function push(d) {
        if (busy || cooldown() > 0 || entered.length >= cfg.len) return;
        entered += d; dots();
        if (entered.length === cfg.len) submitPin();
    }

    async function tryBiometric(silent) {
        if (!cfg?.credId || cooldown() > 0 || bioBusy) return;
        bioBusy = true;
        try {
            await navigator.credentials.get({ publicKey: { challenge: rand(32), userVerification: "required", timeout: 60000,
                allowCredentials: [{ type: "public-key", id: fromB64(cfg.credId), transports: ["internal"] }] } });
            unlock();
        } catch {
            if (!silent) msg("Fingerprint not recognised. Use your PIN.", true);
        } finally { bioBusy = false; hiddenAt = 0; }
    }

    screen.addEventListener("click", async e => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.d !== undefined) push(b.dataset.d);
        if (b.id === "lockBack") { entered = entered.slice(0, -1); dots(); }
        if (b.id === "lockBio") tryBiometric(false);
        if (b.id === "lockForgot") screen.querySelector("#lockLogoutBox").hidden = false;
        if (b.id === "lockLogoutNo") screen.querySelector("#lockLogoutBox").hidden = true;
        if (b.id === "lockLogoutYes") { removeLock(uid); hideLock(); await logout(); }
    });
    document.addEventListener("keydown", e => {
        if (!locked) return;
        if (/^\d$/.test(e.key)) push(e.key);
        if (e.key === "Backspace") { entered = entered.slice(0, -1); dots(); }
    });

    // Lock again when the app has been in the background long enough.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { if (!bioBusy) hiddenAt = Date.now(); return; }
        if (!cfg || locked || bioBusy || !hiddenAt || cfg.timeout === -1) return;
        if ((Date.now() - hiddenAt) / 1000 >= cfg.timeout) showLock();
    });

    function removeLock(id) {
        localStorage.removeItem(cfgKey(id));
        if (localStorage.getItem(KEY_UID) === id) localStorage.removeItem(KEY_UID);
        if (uid === id) { uid = null; cfg = null; }
    }

    // ---------- start-up: cover the app straight away if a lock exists ----------
    if (cfg) showLock(); else document.documentElement.classList.remove("lock-pending");

    // ---------- settings card ----------
    function askPin(title, note = "") {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay lock-modal";
            overlay.innerHTML = `<div class="modal"><h3>${esc(title)}</h3>${note ? `<p class="confirm-text">${esc(note)}</p>` : ""}
                <form><input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" class="pin-input" placeholder="••••" required>
                <div class="modal-actions"><button type="button" class="secondary-button" data-x>Cancel</button>
                <button type="submit" class="primary-button">Continue</button></div></form></div>`;
            const done = v => { overlay.remove(); resolve(v); };
            overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-x]")) done(null); });
            overlay.querySelector("form").addEventListener("submit", e => {
                e.preventDefault();
                const v = overlay.querySelector("input").value;
                if (/^\d{4,6}$/.test(v)) done(v); else toast("Use 4 to 6 digits.", "error");
            });
            document.body.append(overlay);
            overlay.querySelector("input").focus();
        });
    }
    async function newPin() {
        const a = await askPin("Choose a PIN", "4 to 6 digits. You'll use it if your fingerprint isn't available.");
        if (!a) return null;
        const b = await askPin("Confirm your PIN");
        if (!b) return null;
        if (a !== b) { toast("The PINs didn't match. Try again.", "error"); return null; }
        return a;
    }
    async function verifyCurrent() {
        const pin = await askPin("Enter your current PIN");
        if (!pin) return false;
        const ok = (await hashPin(pin, fromB64(cfg.salt), cfg.iterations)) === cfg.hash;
        if (!ok) toast("That PIN is not correct.", "error");
        return ok;
    }
    async function buildCfg(pin, keep = {}) {
        const salt = rand(16), iterations = 120000;
        return { salt: toB64(salt), iterations, hash: await hashPin(pin, salt, iterations), len: pin.length,
            credId: keep.credId || null, timeout: keep.timeout ?? 60, fails: 0, lockedUntil: 0 };
    }
    async function enableBiometric() {
        bioBusy = true;
        try {
            const cred = await navigator.credentials.create({ publicKey: {
                challenge: rand(32), rp: { name: "PesaTrack", id: location.hostname },
                user: { id: rand(16), name: user?.email || uid, displayName: user?.displayName || "PesaTrack user" },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
                timeout: 60000, attestation: "none" } });
            cfg.credId = toB64(cred.rawId); saveCfg(uid, cfg);
            toast("Fingerprint unlock is on", "success");
            return true;
        } catch {
            toast("Couldn't set up fingerprint. Make sure a screen lock or fingerprint is set up on your phone.", "error");
            return false;
        } finally { bioBusy = false; hiddenAt = 0; }
    }

    async function renderSettings() {
        const box = $("lockBody");
        if (!box || !user) return;
        const bio = await biometricAvailable();
        if (!cfg || uid !== user.uid) {
            box.innerHTML = `<p class="confirm-text">Ask for a PIN${bio ? " or your fingerprint" : ""} whenever PesaTrack is opened, so nobody else can see your money.</p>
                <button type="button" class="primary-button" id="lockSetup">Set up app lock</button>`;
            return;
        }
        box.innerHTML = `
            <div class="lock-status"><span>🔢 PIN</span><strong>On</strong></div>
            <div class="lock-status"><span>👆 Fingerprint / face</span>
                ${cfg.credId ? `<strong>On</strong> <button type="button" class="link-button" id="lockBioOff">Turn off</button>`
                    : bio ? `<button type="button" class="link-button" id="lockBioOn">Turn on</button>` : `<strong class="muted">Not available</strong>`}</div>
            <div class="form-group"><label for="lockTimeout">Lock the app</label>
                <select id="lockTimeout">${TIMEOUTS.map(([v, l]) => `<option value="${v}" ${cfg.timeout === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="heading-actions">
                <button type="button" class="secondary-button" id="lockNow">🔒 Lock now</button>
                <button type="button" class="secondary-button" id="lockChange">Change PIN</button>
                <button type="button" class="secondary-button" id="lockOff">Turn off</button>
            </div>`;
    }

    $("lockCard").addEventListener("click", async e => {
        const id = e.target.id;
        if (!id || !user) return;
        if (id === "lockSetup") {
            const pin = await newPin();
            if (!pin) return;
            uid = user.uid; cfg = await buildCfg(pin);
            saveCfg(uid, cfg); localStorage.setItem(KEY_UID, uid);
            toast("App lock is on", "success");
            if (await biometricAvailable() && await confirmDialog("Also unlock with your fingerprint or face?", "Yes, enable")) await enableBiometric();
        }
        if (id === "lockBioOn") await enableBiometric();
        if (id === "lockBioOff") { cfg.credId = null; saveCfg(uid, cfg); toast("Fingerprint unlock is off"); }
        if (id === "lockNow") showLock();
        if (id === "lockChange" && await verifyCurrent()) {
            const pin = await newPin();
            if (pin) { cfg = await buildCfg(pin, cfg); saveCfg(uid, cfg); toast("PIN changed", "success"); }
        }
        if (id === "lockOff" && await verifyCurrent()) { removeLock(user.uid); toast("App lock is off", "success"); }
        renderSettings();
    });
    $("lockCard").addEventListener("change", e => {
        if (e.target.id === "lockTimeout" && cfg) { cfg.timeout = Number(e.target.value); saveCfg(uid, cfg); }
    });

    return {
        onUser(u) {
            user = u;
            if (!u) return;
            const mine = loadCfg(u.uid);
            if (mine && (uid !== u.uid || !cfg)) { uid = u.uid; cfg = mine; if (!locked) showLock(); }   // another account's lock was showing
            else if (!mine && uid && uid !== u.uid) { uid = null; cfg = null; hideLock(); }                // lock belongs to someone else
            else if (!cfg) hideLock();
            renderSettings();
        }
    };
}
