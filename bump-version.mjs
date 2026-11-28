// PesaTrack: raises the Android app version so phones know there is an update.
// Run from the project root:  node bump-version.mjs 0.15.0     (versionCode goes up by one automatically)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const file = "android/app/build.gradle.kts", name = process.argv[2] || "";
if (!existsSync(file)) { console.log("✗ run this from the project root"); process.exit(1); }
if (!/^\d+\.\d+\.\d+$/.test(name)) { console.log('✗ give the new version name, like:  node bump-version.mjs 0.15.0'); process.exit(1); }
let t = readFileSync(file, "utf8");
const code = Number((t.match(/versionCode\s*=\s*(\d+)/) || [])[1]), old = (t.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];
if (!code || !old) { console.log("✗ couldn't find the version in " + file); process.exit(1); }
if (old === name) { console.log(`• already at ${name}, nothing changed`); process.exit(0); }
t = t.replace(/(versionCode\s*=\s*)\d+/, `$1${code + 1}`).replace(/(versionName\s*=\s*")[^"]+(")/, `$1${name}$2`);
writeFileSync(file, t);
console.log(`✓ version ${old} (${code}) -> ${name} (${code + 1})\nNext: git add . ; git commit -m "Version ${name}" ; git push origin main   (the build publishes the APK)`);
