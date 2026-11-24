package br.com.suiri.empresa;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String CHANNEL = "suiri_alertas_detalhados";
    private static final String ALERT_ACTION = "br.com.suiri.ABRIR_ALERTAS";
    private static final int CAMERA_REQUEST = 11;
    private static final int LOCATION_REQUEST = 12;
    private static final int NOTIFICATION_REQUEST = 13;
    private static final int FILE_PICKER_REQUEST = 14;

    private WebView web;
    private FrameLayout root;
    private PermissionRequest cameraRequest;
    private GeolocationPermissions.Callback locationCallback;
    private String notificationPermissionCall;
    private ValueCallback<Uri[]> picker;
    private boolean openAlerts;
    private boolean ready;
    private NotificationManager notifications;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        notifications = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Avisos do Suíri", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Mensagens da equipe e avisos operacionais");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        notifications.createNotificationChannel(channel);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets segura = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets teclado = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(segura.left, segura.top, segura.right, Math.max(segura.bottom, teclado.bottom));
                return insets;
            });
        }

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        web.setWebChromeClient(new Chrome());
        web.setWebViewClient(new LocalAssets());
        web.addJavascriptInterface(new NativeBridge(), "SuiriAndroidNative");
        setPalette(false);
        openAlerts = ALERT_ACTION.equals(getIntent().getAction());
        web.loadUrl(ORIGIN + "/index.html");
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (ALERT_ACTION.equals(intent.getAction())) {
            openAlerts = true;
            dispatchOpenAlerts();
        }
    }

    private void dispatchOpenAlerts() {
        if (!ready || !openAlerts) return;
        openAlerts = false;
        web.evaluateJavascript("window.dispatchEvent(new Event('suiri-android-notificacoes'))", null);
    }

    private void setPalette(boolean dark) {
        int background = Color.parseColor(dark ? "#10141e" : "#F5F7FA");
        root.setBackgroundColor(background);
        web.setBackgroundColor(background);
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(background);
            getWindow().setNavigationBarColor(background);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(dark ? 0 : flags, flags);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(dark ? 0
                : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.suiriTratarVoltarAndroid?.() === true", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean allowedNotifications() {
        return notifications.areNotificationsEnabled() && (Build.VERSION.SDK_INT < 33
            || has(Manifest.permission.POST_NOTIFICATIONS));
    }

    private boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private void openExternal(String url) {
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Nenhum navegador disponível.", Toast.LENGTH_SHORT).show();
        }
    }

    private final class LocalAssets extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!isLocal(uri)) return null;
            String path = uri.getPath();
            if (path == null || "/".equals(path)) path = "/index.html";
            if (!"GET".equals(request.getMethod()) || path.contains("\\")
                || Arrays.asList(path.split("/")).contains("..")) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), null);
            }
            try {
                InputStream data = getAssets().open("public" + path);
                String type = URLConnection.guessContentTypeFromName(path);
                if (path.endsWith(".js")) type = "application/javascript";
                if (path.endsWith(".css")) type = "text/css";
                if (path.endsWith(".json")) type = "application/json";
                if (path.endsWith(".woff2")) type = "font/woff2";
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                if (path.endsWith(".html")) {
                    headers.put("Content-Security-Policy", "frame-src 'none'; object-src 'none'; base-uri 'self'");
                }
                return new WebResourceResponse(type == null ? "application/octet-stream" : type,
                    "UTF-8", 200, "OK", headers, data);
            } catch (IOException error) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), null);
            }
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isLocal(request.getUrl())) return false;
            if (request.isForMainFrame()) openExternal(request.getUrl().toString());
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override public void onPermissionRequest(PermissionRequest request) {
            if (!isLocal(request.getOrigin()) || cameraRequest != null
                || !Arrays.equals(request.getResources(), new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE})) {
                request.deny();
                return;
            }
            if (has(Manifest.permission.CAMERA)) request.grant(request.getResources());
            else {
                cameraRequest = request;
                requestPermissions(new String[] {Manifest.permission.CAMERA}, CAMERA_REQUEST);
            }
        }

        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (cameraRequest == request) cameraRequest = null;
        }

        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isLocal(Uri.parse(origin)) || locationCallback != null) {
                callback.invoke(origin, false, false);
                return;
            }
            if (has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            locationCallback = (requested, allowed, retain) -> callback.invoke(origin, allowed, false);
            requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                LOCATION_REQUEST);
        }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (picker != null) picker.onReceiveValue(null);
            picker = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_PICKER_REQUEST);
            } catch (ActivityNotFoundException error) {
                picker = null;
                callback.onReceiveValue(null);
            }
            return true;
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == CAMERA_REQUEST && cameraRequest != null) {
            if (has(Manifest.permission.CAMERA)) cameraRequest.grant(cameraRequest.getResources());
            else cameraRequest.deny();
            cameraRequest = null;
        } else if (code == LOCATION_REQUEST && locationCallback != null) {
            locationCallback.invoke(ORIGIN, has(Manifest.permission.ACCESS_COARSE_LOCATION), false);
            locationCallback = null;
        } else if (code == NOTIFICATION_REQUEST && notificationPermissionCall != null) {
            reply(notificationPermissionCall, allowedNotifications());
            notificationPermissionCall = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_PICKER_REQUEST && picker != null) {
            picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            picker = null;
        }
    }

    private void reply(String id, boolean result) {
        web.evaluateJavascript("window.suiriResultadoNativo?.(" + JSONObject.quote(id) + "," + result + ")", null);
    }

    private void displayNotifications(String events) {
        if (!allowedNotifications()) return;
        try {
            JSONArray list = new JSONArray(events);
            for (int i = 0; i < list.length(); i++) {
                JSONObject item = list.getJSONObject(i);
                String id = item.getString("id");
                String title = item.optString("titulo", "Aviso do Suíri");
                String body = item.optString("detalhe", "");
                Intent intent = new Intent(this, MainActivity.class).setAction(ALERT_ACTION);
                PendingIntent pending = PendingIntent.getActivity(this, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification notification = new Notification.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.ic_alert)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setContentIntent(pending)
                    .setAutoCancel(true)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .build();
                notifications.notify(id, 1, notification);
            }
        } catch (JSONException | SecurityException error) {
            android.util.Log.w("Suiri", "Falha ao exibir um aviso", error);
        }
    }

    private final class NativeBridge {
        @JavascriptInterface public void ready() {
            runOnUiThread(() -> { ready = true; dispatchOpenAlerts(); });
        }
        @JavascriptInterface public void palette(boolean dark) { runOnUiThread(() -> setPalette(dark)); }
        @JavascriptInterface public void open(String url) { runOnUiThread(() -> openExternal(url)); }
        @JavascriptInterface public void notifyDetails(String events) { runOnUiThread(() -> displayNotifications(events)); }
        @JavascriptInterface public void clearNotifications() { runOnUiThread(() -> notifications.cancelAll()); }
        @JavascriptInterface public void requestNotifications(String id) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 33 || has(Manifest.permission.POST_NOTIFICATIONS)) {
                    reply(id, allowedNotifications());
                } else if (notificationPermissionCall == null) {
                    notificationPermissionCall = id;
                    requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
                } else reply(id, false);
            });
        }
        @JavascriptInterface public boolean saveFile(String b64, String name, String mime) {
            if (Build.VERSION.SDK_INT < 29 || b64.length() > 60_000_000
                || !Arrays.asList("text/csv", "application/pdf").contains(mime)) return false;
            String safe = name.replaceAll("[/\\\\\r\n]", "_");
            if (safe.isEmpty()) return false;
            Uri item = null;
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (item == null) return false;
                try (OutputStream out = getContentResolver().openOutputStream(item)) {
                    if (out == null) throw new IOException("Arquivo indisponível");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                if (getContentResolver().update(item, values, null, null) == 1) return true;
            } catch (IOException | RuntimeException error) {
                android.util.Log.w("Suiri", "Falha ao salvar arquivo", error);
            }
            if (item != null) {
                try { getContentResolver().delete(item, null, null); }
                catch (RuntimeException error) { android.util.Log.w("Suiri", "Falha ao limpar arquivo", error); }
            }
            return false;
        }
    }
}
