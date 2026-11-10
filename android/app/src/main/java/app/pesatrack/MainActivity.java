package app.pesatrack;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import org.json.JSONObject;
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

    // ---------- fingerprint / face unlock for the app lock ----------
    private void reply(final String id, final boolean ok) {
        final String js = "(function(){var m=window.__pesaBio,f=m&&m[\"" + id + "\"];if(f){delete m[\"" + id + "\"];f(" + ok + ");}})()";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private void promptBiometric(final String id) {
        if (Build.VERSION.SDK_INT < 28) { reply(id, false); return; }
        try {
            android.hardware.biometrics.BiometricPrompt prompt = new android.hardware.biometrics.BiometricPrompt.Builder(this)
                    .setTitle("Unlock PesaTrack")
                    .setNegativeButton("Use PIN", getMainExecutor(), (d, w) -> reply(id, false))
                    .build();
            prompt.authenticate(new android.os.CancellationSignal(), getMainExecutor(),
                    new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r) { reply(id, true); }
                        @Override public void onAuthenticationError(int code, CharSequence msg) { reply(id, false); }
                    });
        } catch (Exception e) { reply(id, false); }
    }

    // ---------- Google sign-in with the phone's own account sheet ----------
    private void replyGoogle(final String id, String token, String error) {
        try {
            JSONObject o = new JSONObject().put("token", token == null ? JSONObject.NULL : token).put("error", error == null ? JSONObject.NULL : error);
            final String js = "(function(){var m=window.__pesaGoogle,f=m&&m[\"" + id + "\"];if(f){delete m[\"" + id + "\"];f(" + o + ");}})()";
            web.post(() -> web.evaluateJavascript(js, null));
        } catch (Exception ignored) {}
    }

    private void startGoogleSignIn(final String webClientId, final String id) {
        try {
            CredentialManager manager = CredentialManager.create(this);
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(new GetSignInWithGoogleOption.Builder(webClientId).build()).build();
            manager.getCredentialAsync(this, request, new CancellationSignal(), command -> runOnUiThread(command),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse result) {
                            try {
                                Credential c = result.getCredential();
                                if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                                    replyGoogle(id, GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData()).getIdToken(), null);
                                    return;
                                }
                            } catch (Exception ignored) {}
                            replyGoogle(id, null, "failed:unexpected result");
                        }
                        @Override public void onError(GetCredentialException e) {
                            android.util.Log.w("PesaTrack", "Google sign-in error: " + e.getType() + " / " + e.getMessage());
                            replyGoogle(id, null, e instanceof GetCredentialCancellationException ? "cancelled"
                                    : e instanceof NoCredentialException ? "no-account" : "failed:" + e.getType() + " " + e.getMessage());
                        }
                    });
        } catch (Exception e) {
            android.util.Log.w("PesaTrack", "Google sign-in start error", e);
            replyGoogle(id, null, "failed:" + e);
        }
    }

    final class Bridge {
        @JavascriptInterface public void googleSignIn(final String webClientId, final String id) {
            if (id == null || !id.matches("[a-z0-9]{1,32}") || webClientId == null || !webClientId.matches("[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com")) return;
            runOnUiThread(() -> startGoogleSignIn(webClientId, id));
        }
        @JavascriptInterface public boolean biometricAvailable() {
            if (Build.VERSION.SDK_INT < 29) return false;
            android.hardware.biometrics.BiometricManager bm = getSystemService(android.hardware.biometrics.BiometricManager.class);
            return bm != null && bm.canAuthenticate() == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
        }
        @JavascriptInterface public void authenticate(final String id) {
            if (id == null || !id.matches("[a-z0-9]{1,32}")) return;
            runOnUiThread(() -> promptBiometric(id));
        }
        @JavascriptInterface public void saveConfig(String uid, String apiKey, String secret, String project) {
            Sender.saveConfig(getApplicationContext(), uid, apiKey, secret, project);
        }
        @JavascriptInterface public void saveAuth(String refreshToken) { Sender.saveAuth(getApplicationContext(), refreshToken); }
        @JavascriptInterface public void clearConfig() { Sender.clearConfig(getApplicationContext()); }
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
