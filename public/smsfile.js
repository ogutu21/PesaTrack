// Reads M-Pesa messages out of files people already have:
//  - "SMS Backup & Restore" XML backups (Android)
//  - JSON exports (arrays of { body, address })
//  - plain text / CSV (the messages are found by their transaction codes)
// Pure functions: no DOM, no network.

const decode = s => s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const looksMpesa = (address, body) => /m-?pesa/i.test(address || "") || /\b[A-Z0-9]{10}\s+confirmed\b/i.test(body || "");
const SMS_TAG = /<sms\b((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// Returns { messages: [text...], total, kind } where total = messages seen in the file.
export function extractMessages(text) {
    const t = String(text || "");
    const messages = [];
    let total = 0;

    if (/<smses\b|<sms\b/i.test(t)) {
        for (const m of t.matchAll(SMS_TAG)) {
            total++;
            const a = {};
            for (const x of m[1].matchAll(ATTR)) a[x[1]] = decode(x[2] ?? x[3] ?? "");
            if (a.type && a.type !== "1") continue;                    // 1 = received; skip sent and drafts
            if (a.body && looksMpesa(a.address, a.body)) messages.push(a.body);
        }
        return { messages, total, kind: "SMS Backup & Restore (XML)" };
    }

    if (/^\s*[\[{]/.test(t)) {
        try {
            let data = JSON.parse(t);
            if (!Array.isArray(data)) data = data.messages || data.sms || data.data || [];
            for (const m of data) {
                total++;
                const body = typeof m === "string" ? m : (m.body ?? m.text ?? m.message ?? m.content ?? "");
                const address = typeof m === "string" ? "" : (m.address ?? m.sender ?? m.from ?? "");
                if (typeof body === "string" && looksMpesa(address, body)) messages.push(body);
            }
            return { messages, total, kind: "JSON" };
        } catch { /* not JSON after all: fall through to text */ }
    }

    // plain text or CSV: parseMpesa() finds each message by its transaction code
    total = (t.match(/\b[A-Z0-9]{10}\s+[Cc]onfirmed/g) || []).length;
    return { messages: total ? [t] : [], total, kind: "text" };
}
