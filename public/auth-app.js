// Inside the PesaTrack Android app Google blocks its own sign-in page, so hide the button there.
// On the website (no PesaTrackApp) nothing changes.
if (window.PesaTrackApp) {
    for (const el of document.querySelectorAll("#googleButton, .divider")) el.style.display = "none";
}
