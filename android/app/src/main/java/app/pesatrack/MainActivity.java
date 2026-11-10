package app.pesatrack;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// PesaTrack in its own app window, plus the link that lets the page hand this app your inbox key.
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
        web.addJavascriptInterface(new Bridge(), "PesaTrackApp");   // only pages from the allowed hosts below can ever be loaded
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals("pesatrack-92632.web.app") || host.equals("pesatrack-92632.firebaseapp.com")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u));   // anything else opens in the browser
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);
        if (Build.VERSION.SDK_INT >= 23) {
            java.util.ArrayList<String> need = new java.util.ArrayList<>();
            if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECEIVE_SMS);
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) need.add("android.permission.POST_NOTIFICATIONS");
            if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        new Thread(() -> Sender.flush(getApplicationContext())).start();   // send anything that was waiting for a connection
    }

    final class Bridge {
        @JavascriptInterface public void saveConfig(String uid, String apiKey, String secret, String project) {
            Sender.saveConfig(getApplicationContext(), uid, apiKey, secret, project);
        }
        @JavascriptInterface public void saveAuth(String refreshToken) { Sender.saveAuth(getApplicationContext(), refreshToken); }
        @JavascriptInterface public void clearConfig() { Sender.clearConfig(getApplicationContext()); }
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
