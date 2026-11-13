package app.pesatrack;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Java twin of public/mpesa.js: same rules, same categories, same ids. Keep the two in step.
// (tests/parity.sh checks both give identical results on a set of sample messages.)
final class MpesaParser {
    private MpesaParser() {}

    static final class Item {
        String id, code, kind, type, description, category, date;
        double amount, fee;
    }

    /** A move to or from your own M-Shwari / KCB M-PESA savings. Updates a balance; it is not income or spending. */
    static final class Transfer {
        String code, account, dir, date, asOf;   // account: "mshwari" | "kcb" | "fuliza"; dir: "in" (into savings, or Fuliza repaid) | "out" (or Fuliza borrowed)
        double amount, balance;   // for Fuliza, balance = what you still owe
        String due;               // Fuliza only: due date, yyyy-MM-dd, or null
        Double limit;             // Fuliza only: limit still available, or null
        double fee;               // Fuliza only: access fee
    }

    private static final int CI = Pattern.CASE_INSENSITIVE;
    private static final String AMOUNT = "Ksh\\.?\\s?([\\d,]+(?:\\.\\d{1,2})?)";
    private static final String DATE = "(\\d{1,2})/(\\d{1,2})/(\\d{2,4})";

    private static final Object[][] RULES = {
        {"Rent", "\\brent\\b|landlord|apartments?|estates?|property|housing|caretaker"},
        {"Utilities", "kplc|kenya power|token|water|sewer|garbage|electric"},
        {"Airtime & Data", "safaricom|airtel|telkom|airtime|bundles"},
        {"Subscriptions", "netflix|showmax|spotify|dstv|gotv|startimes|youtube|apple|google play|prime video|zuku"},
        {"Bills", "wifi|internet|faiba|starlink|nhif|\\bsha\\b|nssf|kra|county|permit|licen[cs]e"},
        {"Insurance", "insurance|assurance|jubilee|britam|madison|old mutual|heritage"},
        {"Loans & Debt", "fuliza|m-?shwari|loan|tala|branch|zenka|okolea|saccos?|chama|credit"},
        {"Fuel", "petrol|fuel|shell|rubis|vivo energy|total ?energies|kenol|oilibya|ola energy"},
        {"Travel", "airbnb|booking|jambojet|kenya airways|\\bsgr\\b|easy ?coach|modern coast|flight|safari|lodge|resort"},
        {"Transport", "uber|bolt|little cab|matatu|swvl|parking|taxi|cab\\b|boda|toll"},
        {"Groceries", "naivas|quickmart|carrefour|chandarana|supermarket|mboga|grocer|tuskys|cleanshelf|butchery|wholesale|market"},
        {"Food", "kfc|java|pizza|restaurant|cafe|coffee|hotel|glovo|chicken|burger|bakery|eatery|kitchen|foods?\\b|\\bbar\\b|grill|chips|nyama"},
        {"Education", "school|university|college|academy|tuition|helb|campus|institute|nursery|kindergarten"},
        {"Health", "hospital|pharmacy|chemist|clinic|medical|dental|laborator|optical|health|doctor"},
        {"Personal Care", "salon|barber|kinyozi|beauty|\\bspa\\b|cosmetic|nails"},
        {"Clothing", "fashion|boutique|clothes|clothing|shoes|apparel|tailor|mitumba|textile"},
        {"Entertainment", "cinema|sportpesa|betika|odibets|betway|casino|\\bbet\\b|gaming|club\\b|lounge|movie|concert|ticket"},
        {"Gifts & Donations", "church|tithe|harambee|donation|charity|mosque|offering|wedding|fundrais"},
        {"Home & Household", "hardware|furniture|plumb|electrician|repair|paint|household|\\bgas\\b|lpg"},
        {"Shopping", "jumia|kilimall|mall|store|shop|electronics|mart\\b|traders|collection|enterprises?"}
    };
    private static final Pattern[] RULE_PATTERNS = new Pattern[RULES.length];
    static { for (int i = 0; i < RULES.length; i++) RULE_PATTERNS[i] = Pattern.compile((String) RULES[i][1], CI); }

    /** Same as payeeKey() in public/payee-core.js: "Paid to NAIVAS" -> "out naivas". "" when there is no named payee. */
    static String payeeKey(String description, String type) {
        Matcher m = Pattern.compile("^(sent to|paid to|received from)\\s+(.+)$", CI).matcher(description == null ? "" : description);
        if (!m.find()) return "";
        String name = m.group(2).toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
        if (name.length() > 40) name = name.substring(0, 40).trim();
        if (name.isEmpty()) return "";
        return ("income".equals(type) ? "in " : "out ") + name;
    }

    static String guessCategory(String name, String type) {
        String n = name == null ? "" : name;
        if (type.equals("income")) {
            if (find("salary|payroll|wages", n)) return "Salary";
            if (find("refund|reversal", n)) return "Refunds";
            if (find("bonus", n)) return "Bonus";
            if (find("\\bltd\\b|limited|enterprises|investments|company|\\bco\\b", n)) return "Business";
            return "Other";
        }
        for (int i = 0; i < RULES.length; i++) if (RULE_PATTERNS[i].matcher(n).find()) return (String) RULES[i][0];
        return "Other";
    }

    private static boolean find(String regex, String s) { return Pattern.compile(regex, CI).matcher(s).find(); }
    private static Matcher match(String regex, String s) { Matcher m = Pattern.compile(regex, CI).matcher(s); return m.find() ? m : null; }
    private static double toNumber(String s) { return Double.parseDouble(s.replace(",", "")); }

    private static String toISODate(String d, String m, String y) {
        int year = Integer.parseInt(y); if (year < 100) year += 2000;
        int month = Integer.parseInt(m), day = Integer.parseInt(d);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return String.format(Locale.ROOT, "%d-%02d-%02d", year, month, day);
    }

    private static String cleanName(String s) {
        String r = s == null ? "" : s;
        r = r.replaceAll("\\s+\\d{9,12}\\s*$", "");
        r = r.replaceAll("\\s+0\\d{2}\\*+\\d{2,3}\\s*$", "");
        r = r.replaceAll("[.\\s]+$", "");
        r = r.replaceAll("\\s{2,}", " ");
        r = r.replaceAll("^\\s+|\\s+$", "");
        return r.length() > 60 ? r.substring(0, 60) : r;
    }

    private static String hash(String s) {
        long h = 5381;
        for (int i = 0; i < s.length(); i++) h = ((h << 5) + h + s.charAt(i)) & 0xFFFFFFFFL;
        return Long.toString(h, 36);
    }

    private static List<String[]> splitMessages(String text) {   // each: {code or null, body}
        String flat = text.replaceAll("\\s+", " ").replaceAll("^\\s+|\\s+$", "");
        List<String[]> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\b([A-Z0-9]{10})\\s+[Cc]onfirmed").matcher(flat);
        List<int[]> marks = new ArrayList<>(); List<String> codes = new ArrayList<>();
        while (m.find()) { marks.add(new int[] { m.start() }); codes.add(m.group(1)); }
        if (marks.isEmpty()) { if (!flat.isEmpty()) out.add(new String[] { null, flat }); return out; }
        for (int i = 0; i < marks.size(); i++)
            out.add(new String[] { codes.get(i), flat.substring(marks.get(i)[0], i + 1 < marks.size() ? marks.get(i + 1)[0] : flat.length()) });
        return out;
    }

    private static Item parseOne(String code, String body) {
        Matcher when = Pattern.compile(DATE).matcher(body);
        String date = when.find() ? toISODate(when.group(1), when.group(2), when.group(3)) : null;
        Matcher feeM = match("Transaction cost,?\\s*" + AMOUNT, body);
        double fee = feeM != null ? toNumber(feeM.group(1)) : 0;

        String kind, type = "expense", amount, party;
        Matcher m;
        if (find("reversed|reversal", body)) return null;
        if (find("fuliza", body) && !find("(sent to|paid to|received)", body)) return null;

        if ((m = match("you have received\\s+" + AMOUNT + "\\s+from\\s+(.+?)\\s+on\\s+" + DATE, body)) != null) {
            kind = "received"; type = "income"; amount = m.group(1); party = cleanName(m.group(2));
        } else if ((m = match(AMOUNT + "\\s+sent to\\s+(.+?)\\s+on\\s+" + DATE, body)) != null) {
            kind = "sent"; amount = m.group(1); party = cleanName(m.group(2));
        } else if ((m = match(AMOUNT + "\\s+paid to\\s+(.+?)\\.?\\s+on\\s+" + DATE, body)) != null) {
            kind = "paid"; amount = m.group(1); party = cleanName(m.group(2));
        } else if ((m = match("Withdraw\\s+" + AMOUNT + "\\s+from\\s+(.+?)\\s+New", body)) != null) {
            kind = "withdraw"; amount = m.group(1); party = cleanName(m.group(2));
        } else if ((m = match("you bought\\s+" + AMOUNT + "\\s+of airtime", body)) != null) {
            kind = "airtime"; amount = m.group(1); party = "Airtime";
        } else if ((m = match("Give\\s+" + AMOUNT + "\\s+cash to\\s+(.+?)\\s+New", body)) != null) {
            kind = "deposit"; type = "income"; amount = m.group(1); party = cleanName(m.group(2));
        } else {
            return null;
        }

        double amt = toNumber(amount);
        if (!(amt > 0) || date == null) return null;

        String description;
        switch (kind) {
            case "received": description = "Received from " + party; break;
            case "sent": description = "Sent to " + party; break;
            case "paid": description = "Paid to " + party; break;
            case "withdraw": description = "M-Pesa withdrawal" + (party.isEmpty() ? "" : " (" + party + ")"); break;
            case "airtime": description = "Airtime purchase"; break;
            default: description = "M-Pesa cash deposit";
        }
        if (description.length() > 100) description = description.substring(0, 100);

        Item it = new Item();
        it.kind = kind; it.type = type; it.amount = amt; it.fee = fee; it.date = date; it.description = description; it.code = code;
        it.category = kind.equals("airtime") ? "Airtime & Data" : kind.equals("withdraw") ? "Other" : guessCategory(party, type);
        it.id = code != null ? "mpesa-" + code : "mpesa-h" + hash(body);
        return it;
    }

    private static Transfer parseTransfer(String code, String body) {
        String acct = "(M-?Shwari|KCB\\s+M-?PESA)";
        String tail = "\\s+account\\s+on\\s+" + DATE;
        Matcher m = match(AMOUNT + "\\s+transfer{1,2}ed\\s+(to|from)\\s+(?:your\\s+)?" + acct + tail, body);
        if (m == null) m = match("transfer{1,2}ed\\s+" + AMOUNT + "\\s+(to|from)\\s+(?:your\\s+)?" + acct + tail, body);
        if (m == null) return null;
        String account = find("shwari", m.group(3)) ? "mshwari" : "kcb";
        String date = toISODate(m.group(4), m.group(5), m.group(6));
        if (date == null) return null;
        String balRe = account.equals("mshwari")
                ? "M-?Shwari(?:\\s+saving)?(?:\\s+account)?\\s+balance\\s+is\\s+" + AMOUNT
                : "KCB\\s+M-?PESA(?:\\s+Saving)?(?:\\s+account)?\\s+balance\\s+is\\s+" + AMOUNT;
        Matcher b = match(balRe, body);
        if (b == null) return null;
        int hh = 0, mm = 0;
        Matcher tm = Pattern.compile("\\bat\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)", CI).matcher(body);
        if (tm.find()) { hh = Integer.parseInt(tm.group(1)) % 12 + (tm.group(3).equalsIgnoreCase("pm") ? 12 : 0); mm = Integer.parseInt(tm.group(2)); }
        Transfer t = new Transfer();
        t.code = code; t.account = account; t.dir = m.group(2).equalsIgnoreCase("to") ? "in" : "out";
        t.amount = toNumber(m.group(1)); t.balance = toNumber(b.group(1)); t.date = date;
        t.asOf = String.format(Locale.ROOT, "%sT%02d:%02d", date, hh, mm);
        return t;
    }

    private static String pad2(int n) { return n < 10 ? "0" + n : String.valueOf(n); }

    // Fuliza (M-Pesa overdraft). Same rules as parseFuliza() in public/mpesa.js; these messages carry no date, so today's date is used.
    private static Transfer parseFuliza(String code, String body) {
        if (!find("fuliza", body) || find("(sent to|paid to|received)", body)) return null;
        java.util.Calendar now = java.util.Calendar.getInstance();
        Transfer t = new Transfer();
        t.code = code; t.account = "fuliza";
        t.date = now.get(java.util.Calendar.YEAR) + "-" + pad2(now.get(java.util.Calendar.MONTH) + 1) + "-" + pad2(now.get(java.util.Calendar.DAY_OF_MONTH));
        t.asOf = t.date + "T" + pad2(now.get(java.util.Calendar.HOUR_OF_DAY)) + ":" + pad2(now.get(java.util.Calendar.MINUTE));
        Matcher lim = match("Available Fuliza M-?PESA limit is\\s+" + AMOUNT, body);
        if (lim != null) t.limit = toNumber(lim.group(1));
        Matcher dm = match("due on\\s+" + DATE, body);
        if (dm != null) t.due = toISODate(dm.group(1), dm.group(2), dm.group(3));
        Matcher rp = match(AMOUNT + "\\s+from your M-?PESA has been used to\\s+(?:(fully|partially)\\s+)?pay your outstanding Fuliza", body);
        if (rp != null) {
            t.dir = "in"; t.amount = toNumber(rp.group(1));
            if (rp.group(2) != null && rp.group(2).equalsIgnoreCase("fully")) t.balance = 0;
            else {
                Matcher o = match("outstanding[^.]*?\\bis\\s+" + AMOUNT, body.substring(rp.end()));
                if (o == null) return null;
                t.balance = toNumber(o.group(1));
            }
            return t;
        }
        Matcher dr = match("Fuliza M-?PESA amount is\\s+" + AMOUNT, body);
        Matcher out = match("Total Fuliza M-?PESA outstanding amount is\\s+" + AMOUNT, body);
        if (dr == null || out == null) return null;
        t.dir = "out"; t.amount = toNumber(dr.group(1)); t.balance = toNumber(out.group(1));
        Matcher fm = match("Access Fee charged\\s+" + AMOUNT, body);
        t.fee = fm != null ? toNumber(fm.group(1)) : 0;
        return t;
    }

    static List<Transfer> parseTransfers(String text) {
        List<Transfer> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String[] msg : splitMessages(text == null ? "" : text)) {
            Transfer t = parseTransfer(msg[0], msg[1]);
            if (t == null) t = parseFuliza(msg[0], msg[1]);
            if (t != null && seen.add("T" + (msg[0] != null ? msg[0] : msg[1]))) out.add(t);
        }
        return out;
    }

    static List<Item> parse(String text) {
        List<Item> items = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String[] msg : splitMessages(text == null ? "" : text)) {
            Item it = parseOne(msg[0], msg[1]);
            if (it == null) {   // a Fuliza borrowing message: its access fee is a real expense
                Transfer f = parseFuliza(msg[0], msg[1]);
                if (f != null && f.fee > 0 && f.dir.equals("out")) {
                    it = new Item();
                    it.id = "mpesa-" + msg[0] + "-fzfee"; it.code = msg[0]; it.kind = "fuliza-fee"; it.type = "expense"; it.amount = f.fee; it.fee = 0;
                    it.date = f.date; it.description = "Fuliza access fee (" + msg[0] + ")"; it.category = "Fees & Charges";
                }
            }
            if (it != null && seen.add(it.id)) items.add(it);
        }
        return items;
    }
}
