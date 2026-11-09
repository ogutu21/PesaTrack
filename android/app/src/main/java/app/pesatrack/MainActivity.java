package app.pesatrack;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Bit 1: PesaTrack in its own app window. Later bits add the M-Pesa SMS listener.
public class MainActivity extends Activity {
    private static final String HOME = "https://pesatrack-92632.web.app/";
    private WebView web;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // sign-in and the offline cache live here
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals("pesatrack-92632.web.app") || host.endsWith(".firebaseapp.com")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u));   // anything else opens in the browser
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
