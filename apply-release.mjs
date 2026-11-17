// PesaTrack: every app build also appears as a GitHub Release with a plain .apk you can download and install on the phone (no cable, no zip).
// Run from the project root:  node apply-release.mjs   then  git add . ; git commit -m "Publish APK as a release" ; git push origin main
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const file = ".github/workflows/android.yml";
if (!existsSync(file)) { console.log("✗ .github/workflows/android.yml not found (run from the project root)"); process.exit(1); }
let text = readFileSync(file, "utf8"); const crlf = text.includes("\r\n"); if (crlf) text = text.replace(/\r\n/g, "\n");
if (text.includes("gh release create")) { console.log("• android.yml: already publishes releases, skipped"); process.exit(0); }
const a = "jobs:\n  apk:\n    runs-on: ubuntu-latest\n";
const b = "          name: PesaTrack-apk";   // placeholder never used; see below
if (text.split(a).length !== 2) { console.log("✗ android.yml: unexpected layout (jobs/apk block), left unchanged"); process.exit(1); }
if (!/upload-artifact@v4/.test(text)) { console.log("✗ android.yml: upload step not found, left unchanged"); process.exit(1); }
text = text.replace(a, a + "    permissions:\n      contents: write   # lets the build publish the release\n");
text = text.replace(/\s*$/, "\n") + `      - name: Publish the APK as a release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          VERSION=$(grep -oP 'versionName = "\\K[^"]+' android/app/build.gradle.kts)
          cp android/app/build/outputs/apk/release/app-release.apk "PesaTrack-$VERSION.apk"
          gh release delete "v$VERSION" --cleanup-tag --yes || true
          gh release create "v$VERSION" "PesaTrack-$VERSION.apk" --target "$GITHUB_SHA" --title "PesaTrack $VERSION" --notes "Open this file on your phone to install or update PesaTrack. Your data stays in your account."
`;
writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
console.log("✓ android.yml: each build now publishes a release with PesaTrack-<version>.apk\n\nNext: git add . ; git commit -m \"Publish APK as a release\" ; git push origin main");
