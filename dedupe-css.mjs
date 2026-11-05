// Cleans up layered CSS without changing how the page looks.
//
// It removes a declaration ONLY when a later rule with the SAME selector, in the SAME
// @media / @supports context, sets the same property. In that case the earlier one can never
// win, so deleting it cannot change the result. Anything uncertain is left alone:
//   - values using dvh/svh/lvh or env() (they may be fallbacks for older browsers)
//   - an earlier !important that the later rule doesn't also mark !important
//   - duplicates inside one rule (fallback pattern), @keyframes, @font-face, comments
//   - rules with different selector text (e.g. ".a, .b" vs ".a")
//
// Usage (project root):
//   node dedupe-css.mjs --dry              show what would be removed, change nothing
//   node dedupe-css.mjs                    clean public/style.css (backup: style.before-dedupe.css)
//   node dedupe-css.mjs path/to/file.css
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const norm = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const UNSAFE = /(dvh|svh|lvh|dvw|svw|lvw)|env\(/i;

export function parse(src) {
    const skipString = (i) => { const q = src[i]; i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; } return i + 1; };
    const skipComment = (i) => { const e = src.indexOf("*/", i + 2); return e < 0 ? src.length : e + 2; };

    function blockEnd(open) {
        let depth = 0;
        for (let i = open; i < src.length;) {
            const ch = src[i];
            if (ch === '"' || ch === "'") { i = skipString(i); continue; }
            if (ch === "/" && src[i + 1] === "*") { i = skipComment(i); continue; }
            if (ch === "{") depth++;
            if (ch === "}") { depth--; if (depth === 0) return i + 1; }
            i++;
        }
        return src.length;
    }

    function parseDecls(a, b) {
        const decls = [];
        let i = a, segStart = a, paren = 0;
        const flush = (segEnd, semi) => {
            let s = segStart;
            for (;;) {   // skip whitespace and comments at the start of the declaration
                while (s < segEnd && /\s/.test(src[s])) s++;
                if (src.startsWith("/*", s)) s = skipComment(s); else break;
            }
            if (s >= segEnd) return;
            const text = src.slice(s, segEnd).replace(/\/\*[\s\S]*?\*\//g, "");
            const colon = text.indexOf(":");
            if (colon < 0) return;
            const prop = text.slice(0, colon).trim().toLowerCase();
            let value = text.slice(colon + 1).trim();
            const important = /!\s*important$/i.test(value);
            value = value.replace(/!\s*important$/i, "").trim();
            let e = segEnd;
            if (!semi) while (e > s && /\s/.test(src[e - 1])) e--;
            decls.push({ prop, value, important, start: s, end: semi ? segEnd + 1 : e });
        };
        while (i < b) {
            const ch = src[i];
            if (ch === '"' || ch === "'") { i = skipString(i); continue; }
            if (ch === "/" && src[i + 1] === "*") { i = skipComment(i); continue; }
            if (ch === "{") return null;          // nested rules: don't touch this rule
            if (ch === "(") paren++;
            if (ch === ")") paren--;
            if (ch === ";" && paren <= 0) { flush(i, true); segStart = i + 1; }
            i++;
        }
        flush(b, false);
        return decls;
    }

    function parseNodes(start, end) {
        const nodes = [];
        let i = start;
        while (i < end) {
            if (/\s/.test(src[i])) { i++; continue; }
            if (src.startsWith("/*", i)) { i = skipComment(i); continue; }
            const pStart = i;
            let paren = 0;
            while (i < end) {
                const ch = src[i];
                if (ch === '"' || ch === "'") { i = skipString(i); continue; }
                if (ch === "/" && src[i + 1] === "*") { i = skipComment(i); continue; }
                if (ch === "(") paren++;
                if (ch === ")") paren--;
                if (paren <= 0 && (ch === "{" || ch === ";")) break;
                i++;
            }
            if (i >= end || src[i] === ";") { i++; continue; }   // e.g. @import ...;
            const prelude = src.slice(pStart, i).trim();
            const close = blockEnd(i);
            if (prelude.startsWith("@")) {
                const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
                if (name === "media" || name === "supports") {
                    nodes.push({ kind: "at", prelude: norm(prelude), children: parseNodes(i + 1, close - 1) });
                }   // @keyframes, @font-face, ... are skipped entirely (never edited)
            } else {
                const decls = parseDecls(i + 1, close - 1);
                if (decls) nodes.push({ kind: "rule", selector: norm(prelude), start: pStart, end: close, decls });
            }
            i = close;
        }
        return nodes;
    }
    return parseNodes(0, src.length);
}

function expand(s, start, end, wholeRule) {
    const ls = s.lastIndexOf("\n", start - 1) + 1;
    let le = s.indexOf("\n", end);
    if (le < 0) le = s.length;
    if (s.slice(ls, start).trim() === "" && s.slice(end, le).trim() === "") {
        let b = Math.min(le + 1, s.length);
        // don't leave two blank lines behind when a whole rule disappears
        if (wholeRule && /\n[ \t]*\r?\n$/.test(s.slice(0, ls)) && /^[ \t]*\r?\n/.test(s.slice(b))) b += s.slice(b).indexOf("\n") + 1;
        return [ls, b];
    }
    let e = end;
    while (e < s.length && (s[e] === " " || s[e] === "\t")) e++;
    return [start, e];
}

export function dedupe(src) {
    const groups = new Map();
    (function walk(list, ctx) {
        for (const n of list) {
            if (n.kind === "at") walk(n.children, `${ctx}\u0001${n.prelude}`);
            else {
                const key = `${ctx}\u0002${n.selector}`;
                if (!groups.has(key)) groups.set(key, { ctx, rules: [] });
                groups.get(key).rules.push(n);
            }
        }
    })(parse(src), "");

    const edits = [], stats = { declarations: 0, rules: 0, examples: [] };
    for (const { ctx, rules } of groups.values()) {
        if (rules.length < 2) continue;
        const cover = new Map();   // property -> is the strongest later setting !important?
        for (let r = rules.length - 1; r >= 0; r--) {
            const rule = rules[r];
            const dead = rule.decls.filter(d => {
                const c = cover.get(d.prop);
                return c !== undefined && (!d.important || c);
            });
            for (const d of rule.decls) {
                if (UNSAFE.test(d.value)) continue;
                cover.set(d.prop, Boolean(cover.get(d.prop)) || d.important);
            }
            if (!dead.length) continue;
            const where = ctx ? `${ctx.replace(/\u0001/g, " ").trim()} ` : "";
            if (dead.length === rule.decls.length) {
                edits.push({ start: rule.start, end: rule.end, whole: true });
                stats.rules++;
                stats.declarations += dead.length;
                stats.examples.push(`${where}${rule.selector} { whole rule (${dead.map(d => d.prop).join(", ")}) }`);
            } else {
                dead.forEach(d => edits.push({ start: d.start, end: d.end, whole: false }));
                stats.declarations += dead.length;
                stats.examples.push(`${where}${rule.selector} { ${dead.map(d => d.prop).join(", ")} }`);
            }
        }
    }
    let out = src;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) {
        const [a, b] = expand(out, e.start, e.end, e.whole);
        out = out.slice(0, a) + out.slice(b);
    }
    return { css: out, stats };
}

// ---------------------------------------------------------------- command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2), dry = args.includes("--dry");
    const file = args.find(a => !a.startsWith("--")) || "public/style.css";
    if (!existsSync(file)) { console.log(`✗ ${file} not found. Run from the project root, or pass the path.`); process.exit(1); }
    const src = readFileSync(file, "utf8");
    const { css, stats } = dedupe(src);
    stats.examples.slice(0, 40).forEach(x => console.log("  - " + x));
    if (stats.examples.length > 40) console.log(`  ... and ${stats.examples.length - 40} more`);
    console.log(`\n${stats.declarations} dead declaration(s) in ${stats.examples.length} rule(s); ${stats.rules} rule(s) removed entirely.`);
    console.log(`Size: ${src.length} -> ${css.length} characters.`);
    if (dry) { console.log("Dry run: nothing written."); process.exit(0); }
    if (css === src) { console.log("Nothing to remove."); process.exit(0); }
    const backup = file.replace(/\.css$/, ".before-dedupe.css");
    if (!existsSync(backup)) copyFileSync(file, backup);
    writeFileSync(file, css);
    console.log(`✓ Wrote ${file} (original kept as ${backup})`);
}
