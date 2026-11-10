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

    static List<Item> parse(String text) {
        List<Item> items = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String[] msg : splitMessages(text == null ? "" : text)) {
            Item it = parseOne(msg[0], msg[1]);
            if (it != null && seen.add(it.id)) items.add(it);
        }
        return items;
    }
}
