// M-Pesa SMS parser: turns pasted confirmation messages into transactions.
// Pure functions only (no DOM, no Firebase), so it is easy to test.

const AMOUNT = "Ksh\\.?\\s?([\\d,]+(?:\\.\\d{1,2})?)";
const DATE = "(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})";

const RULES = [
    ["Rent", /\brent\b|landlord|apartments?|estates?|property|housing|caretaker/i],
    ["Utilities", /kplc|kenya power|token|water|sewer|garbage|electric/i],
    ["Airtime & Data", /safaricom|airtel|telkom|airtime|bundles/i],
    ["Subscriptions", /netflix|showmax|spotify|dstv|gotv|startimes|youtube|apple|google play|prime video|zuku/i],
    ["Bills", /wifi|internet|faiba|starlink|nhif|\bsha\b|nssf|kra|county|permit|licen[cs]e/i],
    ["Insurance", /insurance|assurance|jubilee|britam|madison|old mutual|heritage/i],
    ["Loans & Debt", /fuliza|m-?shwari|loan|tala|branch|zenka|okolea|saccos?|chama|credit/i],
    ["Fuel", /petrol|fuel|shell|rubis|vivo energy|total ?energies|kenol|oilibya|ola energy/i],
    ["Travel", /airbnb|booking|jambojet|kenya airways|\bsgr\b|easy ?coach|modern coast|flight|safari|lodge|resort/i],
    ["Transport", /uber|bolt|little cab|matatu|swvl|parking|taxi|cab\b|boda|toll/i],
    ["Groceries", /naivas|quickmart|carrefour|chandarana|supermarket|mboga|grocer|tuskys|cleanshelf|butchery|wholesale|market/i],
    ["Food", /kfc|java|pizza|restaurant|cafe|coffee|hotel|glovo|chicken|burger|bakery|eatery|kitchen|foods?\b|\bbar\b|grill|chips|nyama/i],
    ["Education", /school|university|college|academy|tuition|helb|campus|institute|nursery|kindergarten/i],
    ["Health", /hospital|pharmacy|chemist|clinic|medical|dental|laborator|optical|health|doctor/i],
    ["Personal Care", /salon|barber|kinyozi|beauty|\bspa\b|cosmetic|nails/i],
    ["Clothing", /fashion|boutique|clothes|clothing|shoes|apparel|tailor|mitumba|textile/i],
    ["Entertainment", /cinema|sportpesa|betika|odibets|betway|casino|\bbet\b|gaming|club\b|lounge|movie|concert|ticket/i],
    ["Gifts & Donations", /church|tithe|harambee|donation|charity|mosque|offering|wedding|fundrais/i],
    ["Home & Household", /hardware|furniture|plumb|electrician|repair|paint|household|\bgas\b|lpg/i],
    ["Shopping", /jumia|kilimall|mall|store|shop|electronics|mart\b|traders|collection|enterprises?/i]
];

export function guessCategory(name, type) {
    const n = name || "";
    if (type === "income") {
        if (/salary|payroll|wages/i.test(n)) return "Salary";
        if (/refund|reversal/i.test(n)) return "Refunds";
        if (/bonus/i.test(n)) return "Bonus";
        if (/\bltd\b|limited|enterprises|investments|company|\bco\b/i.test(n)) return "Business";
        return "Other";
    }
    for (const [category, pattern] of RULES) if (pattern.test(n)) return category;
    return "Other";
}

function toNumber(s) { return Number(String(s).replace(/,/g, "")); }

function toISODate(d, m, y) {
    let year = Number(y); if (year < 100) year += 2000;
    const month = Number(m), day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanName(s) {
    return String(s || "")
        .replace(/\s+\d{9,12}\s*$/, "")          // trailing phone number
        .replace(/\s+0\d{2}\*+\d{2,3}\s*$/, "")  // masked phone, e.g. 07**123
        .replace(/[.\s]+$/, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 60);
}

function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

function splitMessages(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    const marks = [...flat.matchAll(/\b([A-Z0-9]{10})\s+[Cc]onfirmed/g)];
    if (!marks.length) return flat ? [{ code: null, body: flat }] : [];
    return marks.map((m, i) => ({
        code: m[1],
        body: flat.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : undefined)
    }));
}

function parseOne({ code, body }) {
    const when = body.match(new RegExp(DATE));
    const date = when ? toISODate(when[1], when[2], when[3]) : null;
    const feeMatch = body.match(new RegExp("Transaction cost,?\\s*" + AMOUNT, "i"));
    const fee = feeMatch ? toNumber(feeMatch[1]) : 0;

    let kind, type = "expense", amount, party;
    let m;

    if (/reversed|reversal/i.test(body)) return { skip: "Reversal" };
    if (/fuliza/i.test(body) && !/(sent to|paid to|received)/i.test(body)) return { skip: "Fuliza notice" };

    if ((m = body.match(new RegExp("you have received\\s+" + AMOUNT + "\\s+from\\s+(.+?)\\s+on\\s+" + DATE, "i")))) {
        kind = "received"; type = "income"; amount = m[1]; party = cleanName(m[2]);
    } else if ((m = body.match(new RegExp(AMOUNT + "\\s+sent to\\s+(.+?)\\s+on\\s+" + DATE, "i")))) {
        kind = "sent"; amount = m[1]; party = cleanName(m[2]);
    } else if ((m = body.match(new RegExp(AMOUNT + "\\s+paid to\\s+(.+?)\\.?\\s+on\\s+" + DATE, "i")))) {
        kind = "paid"; amount = m[1]; party = cleanName(m[2]);
    } else if ((m = body.match(new RegExp("Withdraw\\s+" + AMOUNT + "\\s+from\\s+(.+?)\\s+New", "i")))) {
        kind = "withdraw"; amount = m[1]; party = cleanName(m[2]);
    } else if ((m = body.match(new RegExp("you bought\\s+" + AMOUNT + "\\s+of airtime", "i")))) {
        kind = "airtime"; amount = m[1]; party = "Airtime";
    } else if ((m = body.match(new RegExp("Give\\s+" + AMOUNT + "\\s+cash to\\s+(.+?)\\s+New", "i")))) {
        kind = "deposit"; type = "income"; amount = m[1]; party = cleanName(m[2]);
    } else {
        return { skip: "Unrecognised format" };
    }

    amount = toNumber(amount);
    if (!(amount > 0) || !date) return { skip: !date ? "No date found" : "No amount found" };

    const description = {
        received: `Received from ${party}`,
        sent: `Sent to ${party}`,
        paid: `Paid to ${party}`,
        withdraw: `M-Pesa withdrawal${party ? ` (${party})` : ""}`,
        airtime: "Airtime purchase",
        deposit: "M-Pesa cash deposit"
    }[kind].slice(0, 100);

    const category = kind === "airtime" ? "Airtime & Data" : kind === "withdraw" ? "Other" : guessCategory(party, type);
    const id = code ? `mpesa-${code}` : `mpesa-h${hash(body)}`;

    return { item: { id, code, kind, type, amount, fee, date, description, category } };
}

// Returns { items: [...], skipped: [{ reason, text }] }
export function parseMpesa(text) {
    const items = [], skipped = [], seen = new Set();
    for (const msg of splitMessages(String(text || ""))) {
        const r = parseOne(msg);
        if (r.skip) skipped.push({ reason: r.skip, text: msg.body.slice(0, 80) });
        else if (!seen.has(r.item.id)) { seen.add(r.item.id); items.push(r.item); }
    }
    return { items, skipped };
}
