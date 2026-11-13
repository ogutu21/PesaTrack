package app.pesatrack;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Adds up one month of transactions for the monthly summary notification. No Android code in here, so it can be tested on its own. */
final class SummaryMath {
    double income, expenses;
    int count;
    private final Map<String, Double> byCategory = new HashMap<>();

    void add(String type, String category, double amount) {
        if (!(amount > 0)) return;
        count++;
        if ("income".equals(type)) { income += amount; return; }
        expenses += amount;
        String k = category == null || category.isEmpty() ? "Other" : category;
        Double cur = byCategory.get(k);
        byCategory.put(k, (cur == null ? 0 : cur) + amount);
    }

    private static String money(double v) { return String.format(Locale.US, "Ksh %,.0f", v); }

    /** The biggest spending categories, largest first. */
    List<Map.Entry<String, Double>> top(int n) {
        List<Map.Entry<String, Double>> all = new ArrayList<>(byCategory.entrySet());
        Collections.sort(all, (a, b) -> {
            int c = Double.compare(b.getValue(), a.getValue());
            return c != 0 ? c : a.getKey().compareTo(b.getKey());
        });
        return all.subList(0, Math.min(n, all.size()));
    }

    String text() {
        StringBuilder sb = new StringBuilder("Spent ").append(money(expenses)).append(" · Earned ").append(money(income));
        double net = income - expenses;
        sb.append(net >= 0 ? " · Left over " + money(net) : " · Over by " + money(-net));
        List<Map.Entry<String, Double>> t = top(3);
        if (!t.isEmpty()) {
            sb.append("\nTop spending: ");
            for (int i = 0; i < t.size(); i++) sb.append(i > 0 ? ", " : "").append(t.get(i).getKey()).append(" ").append(money(t.get(i).getValue()));
        }
        return sb.toString();
    }
}
