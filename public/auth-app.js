// Inside the PesaTrack Android app Google blocks its web sign-in page, so use the phone's own Google account sheet instead.
// On the website (no PesaTrackApp) nothing changes.
import { GoogleAuthProvider, signInWithCredential } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

const WEB_CLIENT_ID = "227171165751-bljd608u860p45bbq66k3jmu6e1g42pt.apps.googleusercontent.com";
const app = window.PesaTrackApp;

const MESSAGES = {
    cancelled: "Google sign-in was cancelled.",
    "no-account": "No Google account found on this phone. Add one in Android settings, or sign in with email.",
    failed: "Google sign-in failed. Try again, or use email and password."
};

function nativeGoogle() {
    return new Promise(resolve => {
        const id = "g" + Math.random().toString(36).slice(2, 12);
        (window.__pesaGoogle ||= {})[id] = resolve;
        try { app.googleSignIn(WEB_CLIENT_ID, id); } catch { delete window.__pesaGoogle[id]; resolve({ error: "failed" }); }
    });
}

if (app) {
    const button = document.getElementById("googleButton");
    const ready = typeof app.googleSignIn === "function" && !WEB_CLIENT_ID.startsWith("__");
    if (!ready) {
        // not set up for this app: hide the button rather than send people to a Google error page
        for (const el of document.querySelectorAll("#googleButton, .divider")) el.style.display = "none";
    } else {
        // capture phase, so this runs before the page's own (browser-only) Google handler
        document.addEventListener("click", async e => {
            if (!e.target.closest || !e.target.closest("#googleButton")) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const box = document.getElementById("errorMessage");
            if (box) box.style.display = "none";
            const { token, error } = await nativeGoogle();
            try {
                if (!token) throw new Error(error || "failed");
                await signInWithCredential(auth, GoogleAuthProvider.credential(token));
                window.location.href = "index.html";
            } catch (err) {
                console.error("Google sign-in:", err);
                if (box) { const known = MESSAGES[err.message];
                    const detail = String(err.message).startsWith("failed:") ? String(err.message).slice(7, 160) : (err.code || err.message || "");
                    box.textContent = known || (MESSAGES.failed + (detail ? " (" + String(detail).slice(0, 160) + ")" : "")); box.style.display = "block"; }
            }
        }, true);
    }
}
