package app.pesatrack;
import java.nio.file.*; import java.util.*; import java.util.regex.*;
public class ParityMain {
    static String q(String s) { return s == null ? "null" : "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    public static void main(String[] a) throws Exception {
        String raw = new String(Files.readAllBytes(Paths.get(a[0])), "UTF-8");
        List<String> msgs = new ArrayList<>();
        Matcher m = Pattern.compile("^\"(.*)\",?$", Pattern.MULTILINE).matcher(raw);
        while (m.find()) msgs.add(m.group(1).replace("\\\"", "\""));
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < msgs.size(); i++) {
            out.append(i > 0 ? "," : "").append("{\"items\":[");
            List<MpesaParser.Item> items = MpesaParser.parse(msgs.get(i));
            for (int j = 0; j < items.size(); j++) { MpesaParser.Item it = items.get(j);
                out.append(j > 0 ? "," : "").append("{\"id\":").append(q(it.id)).append(",\"code\":").append(q(it.code)).append(",\"kind\":").append(q(it.kind))
                   .append(",\"type\":").append(q(it.type)).append(",\"amount\":").append(it.amount).append(",\"fee\":").append(it.fee).append(",\"date\":").append(q(it.date))
                   .append(",\"description\":").append(q(it.description)).append(",\"category\":").append(q(it.category)).append("}"); }
            out.append("],\"transfers\":[");
            List<MpesaParser.Transfer> ts = MpesaParser.parseTransfers(msgs.get(i));
            for (int j = 0; j < ts.size(); j++) { MpesaParser.Transfer t = ts.get(j);
                out.append(j > 0 ? "," : "").append("{\"code\":").append(q(t.code)).append(",\"account\":").append(q(t.account)).append(",\"dir\":").append(q(t.dir))
                   .append(",\"amount\":").append(t.amount).append(",\"balance\":").append(t.balance).append(",\"date\":").append(q(t.date)).append(",\"asOf\":").append(q(t.asOf)).append("}"); }
            out.append("]}");
        }
        System.out.println(out.append("]"));
    }
}
