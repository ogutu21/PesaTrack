// Compares the JavaScript and Java parsers on the same messages. Run from the project root: node tests/parity.mjs public/mpesa.js
import { execFileSync } from "node:child_process"; import { readFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, dirname, resolve } from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const { parseMpesa } = await import(pathToFileURL(resolve(process.argv[2] || "public/mpesa.js")).href);
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const out = mkdtempSync(join(tmpdir(), "parity-"));
execFileSync("javac", ["-d", out, join(here, "../android/app/src/main/java/app/pesatrack/MpesaParser.java"), join(here, "ParityMain.java")], { stdio: "inherit" });
const java = JSON.parse(execFileSync("java", ["-cp", out, "app.pesatrack.ParityMain", join(here, "corpus.json")], { env: { ...process.env, JAVA_TOOL_OPTIONS: "" } }).toString());
let items = 0, transfers = 0;
corpus.forEach((text, i) => {
    const r = parseMpesa(text);
    const js = { items: r.items.map(({ id, code, kind, type, amount, fee, date, description, category }) => ({ id, code, kind, type, amount, fee, date, description, category })),
                 transfers: r.transfers.map(({ code, account, dir, amount, balance, date, asOf }) => ({ code, account, dir, amount, balance, date, asOf })) };
    items += js.items.length; transfers += js.transfers.length;
    assert.deepEqual(java[i], js, `message ${i}: ${text.slice(0, 60)}`);
});
console.log(`parity: ${corpus.length} messages, ${items} transactions, ${transfers} savings transfers, Java == JavaScript`);
