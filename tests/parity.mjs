// Compares the JavaScript and Java parsers on the same messages. Run: node tests/parity.mjs <path to public/mpesa.js>
import { execFileSync } from "node:child_process"; import { readFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, dirname, resolve } from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const { parseMpesa } = await import(pathToFileURL(resolve(process.argv[2] || "public/mpesa.js")).href);
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const out = mkdtempSync(join(tmpdir(), "parity-"));
execFileSync("javac", ["-d", out, join(here, "../android/app/src/main/java/app/pesatrack/MpesaParser.java"), join(here, "ParityMain.java")], { stdio: "inherit" });
const java = JSON.parse(execFileSync("java", ["-cp", out, "app.pesatrack.ParityMain", join(here, "corpus.json")], { env: { ...process.env, JAVA_TOOL_OPTIONS: "" } }).toString());
let items = 0;
corpus.forEach((text, i) => { const js = parseMpesa(text).items.map(({ id, code, kind, type, amount, fee, date, description, category }) => ({ id, code, kind, type, amount, fee, date, description, category })); items += js.length; assert.deepEqual(java[i], js, `message ${i}: ${text.slice(0, 60)}`); });
console.log(`parity: ${corpus.length} messages, ${items} transactions, Java == JavaScript`);
