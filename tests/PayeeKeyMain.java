package app.pesatrack;
import java.nio.file.*; import java.util.*;
// prints payeeKey for each "type<TAB>description" line, so JavaScript and Java can be compared
public class PayeeKeyMain {
    public static void main(String[] a) throws Exception {
        for (String line : Files.readAllLines(Paths.get(a[0]), java.nio.charset.StandardCharsets.UTF_8)) {
            int t = line.indexOf('\t');
            System.out.println(MpesaParser.payeeKey(line.substring(t + 1), line.substring(0, t)));
        }
    }
}
