// Tells the Android app when a newer version is available.
// The newest version is described in /app/version.json (written by release-app.mjs).
const installed = (() => { try { return Number(window.PesaTrackApp && PesaTrackApp.versionCode && PesaTrackApp.versionCode()) || 0; } catch { return 0; } })();

const seen = () => { try { return localStorage.getItem("pt_update_later") || ""; } catch { return ""; } };
const remember = v => { try { localStorage.setItem("pt_update_later", String(v)); } catch {} };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

function show(v) {
    const main = document.querySelector("main.main");
    if (!main || document.getElementById("updateBar")) return;
    const bar = el("div", "update-bar"); bar.id = "updateBar"; bar.setAttribute("role", "status");
    const text = el("div", "update-text");
    text.append(el("strong", "", "Update available"),
        el("small", "", `PesaTrack ${v.versionName || ""} is ready${v.notes ? ": " + v.notes : ""}.`));
    const hint = el("small", "update-hint", "Your browser will download a file. Open it and tap Install.");
    hint.hidden = true; text.append(hint);
    const actions = el("div", "update-actions");
    const go = el("button", "primary-button", "Update"); go.type = "button";
    const later = el("button", "secondary-button", "Later"); later.type = "button";
    go.addEventListener("click", () => { try { PesaTrackApp.openUrl(v.url); hint.hidden = false; } catch {} });
    later.addEventListener("click", () => { remember(v.versionCode); bar.remove(); });
    actions.append(go, later);
    bar.append(text, actions);
    main.prepend(bar);
}

let last = 0;
async function check() {
    if (!installed || Date.now() - last < 10 * 60 * 1000) return;
    last = Date.now();
    try {
        const r = await fetch("/app/version.json", { cache: "no-store" });
        if (!r.ok) return;
        const v = await r.json();
        if (!(Number(v.versionCode) > installed) || typeof v.url !== "string" || !v.url.startsWith("https://")) return;
        if (seen() === String(v.versionCode)) return;
        show(v);
    } catch {}
}

if (installed) {
    check();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}
