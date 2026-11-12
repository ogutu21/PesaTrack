// Run from the project root: node tests/payee-parity.mjs   (needs Java)
import { execFileSync } from "node:child_process"; import { writeFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, resolve } from "node:path"; import { pathToFileURL } from "node:url"; import assert from "node:assert/strict";
const { payeeKey } = await import(pathToFileURL(resolve("public/payee-core.js")).href);
const cases = [["expense", "Paid to NAIVAS KILIMANI"], ["expense", "Sent to John  Doe."], ["income", "Received from JANE ROE"], ["expense", "Paid to Café Ñandú & Sons"], ["expense", "Sent to " + "Z".repeat(60)],
    ["expense", "Sent to A.B-C, D/E 2"], ["expense", "Airtime purchase"], ["income", "M-Pesa cash deposit"], ["expense", "paid to lower case"], ["expense", "Paid to !!!"], ["expense", "Paid to"]];
const out = mkdtempSync(join(tmpdir(), "payee-"));
writeFileSync(join(out, "cases.txt"), cases.map(([t, d]) => t + "\t" + d).join("\n"), "utf8");
execFileSync("javac", ["-d", out, "android/app/src/main/java/app/pesatrack/MpesaParser.java", "tests/PayeeKeyMain.java"], { stdio: "inherit" });
const java = execFileSync("java", ["-Dfile.encoding=UTF-8", "-cp", out, "app.pesatrack.PayeeKeyMain", join(out, "cases.txt")], { env: { ...process.env, JAVA_TOOL_OPTIONS: "" } }).toString("utf8").split("\n").slice(0, cases.length);
cases.forEach(([t, d], i) => assert.equal(java[i], payeeKey(d, t), `${t} / ${d}`));
console.log(`payee parity: ${cases.length} cases, Java == JavaScript`);
