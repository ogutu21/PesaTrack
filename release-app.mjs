// PesaTrack: publishes the app download page and the "update available" notice.
// 1. Upload the new PesaTrack-<version>.apk to Google Drive (the first time: share it with "Anyone with the link").
// 2. Run from the project root:   node release-app.mjs "<Google Drive share link>"     (the link is remembered; later runs: node release-app.mjs)
// 3. firebase deploy --only hosting
// Run it only AFTER the new APK is in Drive: phones that see the notice download whatever is in Drive.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const gradle = "android/app/build.gradle.kts";
if (!existsSync(gradle) || !existsSync("public")) { console.log("✗ run this from the project root (the folder containing public/ and android/)"); process.exit(1); }
const g = readFileSync(gradle, "utf8");
const versionCode = Number((g.match(/versionCode\s*=\s*(\d+)/) || [])[1]);
const versionName = (g.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];
if (!versionCode || !versionName) { console.log("✗ couldn't read the version from " + gradle); process.exit(1); }

const manifest = "public/app/version.json";
let old = {}; try { old = JSON.parse(readFileSync(manifest, "utf8")); } catch {}
const arg = process.argv[2] || "";
const fromArg = (arg.match(/\/d\/([A-Za-z0-9_-]{20,})/) || arg.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || arg.match(/^([A-Za-z0-9_-]{25,})$/) || [])[1];
const id = fromArg || old.driveId;
if (arg && !fromArg) { console.log("✗ that doesn't look like a Google Drive file link"); process.exit(1); }
if (!id) { console.log('✗ give the Google Drive share link the first time:\n    node release-app.mjs "https://drive.google.com/file/d/…/view?usp=sharing"'); process.exit(1); }

const download = `https://drive.google.com/uc?export=download&id=${id}`;
const view = `https://drive.google.com/file/d/${id}/view`;
const notes = process.argv.find(a => a.startsWith("--notes="))?.slice(8) ?? old.notes ?? "";
mkdirSync("public/app", { recursive: true });
writeFileSync(manifest, JSON.stringify({ versionCode, versionName, url: download, driveId: id, notes }, null, 2) + "\n");

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
writeFileSync("public/app/index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Get PesaTrack for Android</title>
<meta name="description" content="Download the PesaTrack Android app, which adds your M-Pesa transactions automatically.">
<meta name="theme-color" content="#12100f">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=DM+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/app/app.css">
</head>
<body>
<main class="page">
    <header class="brand"><img src="/icons/icon-192.png" width="44" height="44" alt=""><span>PesaTrack</span></header>
    <h1>Your M-Pesa messages, added for you.</h1>
    <p class="lead">The Android app reads each M-Pesa message as it arrives and adds it to your budget. Nothing to type, even when you're offline.</p>

    <a class="download" href="${esc(download)}" download>Download PesaTrack ${esc(versionName)}</a>
    <p class="meta">Android 7 or newer. Free. If the download doesn't start, <a href="${esc(view)}">open it in Google Drive</a>.</p>

    <h2>Install it in five steps</h2>
    <ol class="steps">
        <li><strong>Open the downloaded file.</strong> Tap <em>Open</em> in your browser, or find <em>PesaTrack-${esc(versionName)}.apk</em> in your Downloads.</li>
        <li><strong>Allow the install.</strong> Android asks once whether your browser or Files app may install apps. Switch it on.</li>
        <li><strong>Tap Install.</strong> If Play Protect shows a warning, choose <em>Install anyway</em>. The app isn't on the Play Store.</li>
        <li><strong>Sign in</strong> with your PesaTrack account, or create one.</li>
        <li><strong>Allow SMS and notifications</strong> when asked. Then open Settings in the app and check the list under Automatic M-Pesa capture. Anything marked ! has a button to fix it.</li>
    </ol>

    <details>
        <summary>SMS access is blocked or greyed out</summary>
        <p>Android can restrict apps installed from a download. Go to Settings, Apps, PesaTrack, tap the ⋮ menu and choose <em>Allow restricted settings</em>. Then open Permissions and allow SMS.</p>
    </details>
    <details>
        <summary>Using an iPhone or another kind of phone?</summary>
        <p>Open <a href="/">${esc("pesatrack-92632.web.app")}</a> in your browser and choose <em>Add to Home screen</em>. You can add transactions by hand or import your M-Pesa statement. Automatic reading needs the Android app.</p>
    </details>
    <p class="foot">Your data stays in your own PesaTrack account. Version ${esc(versionName)}.</p>
</main>
</body>
</html>
`);
writeFileSync("public/app/app.css", `:root { color-scheme: light dark; --bg: #f5f3fa; --surface: #ffffff; --text: #1a1722; --muted: #6b6578; --line: #e4e0ee; --primary: #6d5df0; --primary-text: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #12100f; --surface: #1c1917; --text: #f6f3f0; --muted: #a8a09a; --line: #2f2927; --primary: #8b7cff; --primary-text: #12100f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
.page { max-width: 34rem; margin: 0 auto; padding: 28px 20px 56px; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; font: 700 20px "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -0.01em; }
.brand img { border-radius: 11px; }
h1 { margin: 0 0 12px; font: 700 clamp(30px, 8vw, 40px)/1.08 "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -0.02em; text-wrap: balance; }
h2 { margin: 44px 0 14px; font: 600 20px "Bricolage Grotesque", system-ui, sans-serif; }
.lead { margin: 0 0 28px; color: var(--muted); max-width: 30rem; }
.download { display: block; padding: 17px 20px; border-radius: 12px; background: var(--primary); color: var(--primary-text); font-weight: 600; font-size: 17px; text-align: center; text-decoration: none; }
.download:hover { filter: brightness(1.06); }
.download:focus-visible, a:focus-visible, summary:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
.meta { margin: 12px 0 0; font-size: 14px; color: var(--muted); }
a { color: var(--primary); }
.steps { margin: 0; padding: 0; list-style: none; counter-reset: step; }
.steps li { position: relative; padding: 0 0 18px 44px; counter-increment: step; }
.steps li::before { content: counter(step); position: absolute; left: 0; top: -1px; width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--primary); color: var(--primary); font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; }
details { border-top: 1px solid var(--line); padding: 14px 0; }
details:last-of-type { border-bottom: 1px solid var(--line); }
summary { cursor: pointer; font-weight: 600; }
details p { margin: 10px 0 0; color: var(--muted); }
.foot { margin-top: 32px; font-size: 13px; color: var(--muted); }
`);
console.log(`✓ public/app/version.json: version ${versionName} (${versionCode})\n✓ public/app/index.html and app.css: download page for ${versionName}\n  Drive link: ${view}\n\nNext: firebase deploy --only hosting   (then share https://pesatrack-92632.web.app/app/ with friends)`);
