package com.klm.cut;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST + "/";
    static final int REQ_FILE = 11, REQ_PERM = 12, REQ_STORAGE = 13;

    WebView web;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;

    // file yang dibagikan dari aplikasi lain
    final Object lock = new Object();
    final Map<Integer, Uri> sharedUris = new HashMap<>();
    final List<String[]> sharedQueue = new ArrayList<>(); // {id, name, mime}
    int sharedSeq = 0;

    // penyimpanan hasil ekspor
    OutputStream saveOut;
    Uri saveUri;
    File saveFile;
    String saveMime = "video/mp4", saveName = "", saveLoc = "";
    Uri lastUri;
    String lastMime = "video/mp4";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#0D0D10"));
        getWindow().setNavigationBarColor(Color.parseColor("#0D0D10"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0D0D10"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " KLMCutAndroid/1.1");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "KLMAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return serve(u);
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) { /* abaikan */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(p.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        boolean wantMic = false;
                        for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantMic = true;
                        if (!wantMic) { req.deny(); return; }
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        } else {
                            pendingPerm = req;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_PERM);
                        }
                    }
                });
            }
        });

        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        }

        handleIntent(getIntent());
        web.loadUrl(ORIGIN + "index.html");
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i);
        web.evaluateJavascript("window.KLMShared&&window.KLMShared()", null);
    }

    void handleIntent(Intent i) {
        if (i == null) return;
        String a = i.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(a)) {
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) uris.addAll(l);
        } else if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) {
            uris.add(i.getData());
        }
        if (uris.isEmpty()) return;
        ContentResolver cr = getContentResolver();
        synchronized (lock) {
            for (Uri u : uris) {
                String name = "file";
                Cursor c = null;
                try {
                    c = cr.query(u, null, null, null, null);
                    if (c != null && c.moveToFirst()) {
                        int ix = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (ix >= 0 && c.getString(ix) != null) name = c.getString(ix);
                    }
                } catch (Exception e) { /* abaikan */ } finally { if (c != null) c.close(); }
                String mime = cr.getType(u);
                if (mime == null) mime = "application/octet-stream";
                int id = ++sharedSeq;
                sharedUris.put(id, u);
                sharedQueue.add(new String[]{String.valueOf(id), name, mime});
            }
        }
    }

    /** Menyajikan aset web dari APK dan file bagikan dari aplikasi lain. */
    WebResourceResponse serve(Uri u) {
        String path = u.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        try {
            if (path.startsWith("/__share/")) {
                int id = Integer.parseInt(path.substring(9));
                Uri src;
                synchronized (lock) { src = sharedUris.get(id); }
                if (src == null) return notFound();
                InputStream in = getContentResolver().openInputStream(src);
                String mime = getContentResolver().getType(src);
                return resp(mime == null ? "application/octet-stream" : mime, in);
            }
            String rel = path.substring(1);
            if (rel.contains("..")) return notFound();
            InputStream in = getAssets().open("web/" + rel);
            return resp(mimeOf(rel), in);
        } catch (Exception e) {
            return notFound();
        }
    }

    WebResourceResponse resp(String mime, InputStream in) {
        WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript") || mime.contains("xml") ? "utf-8" : null, in);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        r.setResponseHeaders(h);
        return r;
    }

    WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    static String mimeOf(String f) {
        String e = f.substring(f.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (e) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "webp": return "image/webp";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "ogg": return "audio/ogg";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            case "wasm": return "application/wasm";
            case "txt": case "srt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            if (fileCb == null) return;
            Uri[] r = null;
            if (res == RESULT_OK && data != null) {
                r = WebChromeClient.FileChooserParams.parseResult(res, data);
                if (r == null && data.getData() != null) r = new Uri[]{data.getData()};
            }
            fileCb.onReceiveValue(r);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_PERM && pendingPerm != null) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.KLMBack?window.KLMBack():'exit')", new ValueCallback<String>() {
            public void onReceiveValue(String v) {
                if (v != null && v.contains("handled")) return;
                finish();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        closeSave(false);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    void closeSave(boolean ok) {
        try { if (saveOut != null) saveOut.close(); } catch (IOException e) { /* abaikan */ }
        saveOut = null;
        if (!ok && saveUri != null) {
            try { getContentResolver().delete(saveUri, null, null); } catch (Exception e) { /* abaikan */ }
        }
        if (!ok && saveFile != null) { saveFile.delete(); }
        saveUri = null;
        saveFile = null;
    }

    static String safeName(String n) {
        n = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return n.isEmpty() ? "klm-cut" : n;
    }

    /** Jembatan JS: dipanggil dari web sebagai window.KLMAndroid.* */
    class Bridge {
        @JavascriptInterface
        public synchronized String saveBegin(String name, String mime) {
            try {
                closeSave(false);
                saveName = safeName(name);
                saveMime = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
                String sub, folder;
                if (saveMime.startsWith("video/")) { folder = Environment.DIRECTORY_MOVIES; }
                else if (saveMime.startsWith("audio/")) { folder = Environment.DIRECTORY_MUSIC; }
                else if (saveMime.startsWith("image/")) { folder = Environment.DIRECTORY_PICTURES; }
                else { folder = Environment.DIRECTORY_DOWNLOADS; }
                sub = folder + "/KLM Cut";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, saveName);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, saveMime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, sub);
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri coll;
                    if (saveMime.startsWith("video/")) coll = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    else if (saveMime.startsWith("audio/")) coll = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    else if (saveMime.startsWith("image/")) coll = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    else coll = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    saveUri = getContentResolver().insert(coll, cv);
                    if (saveUri == null) return "Gagal membuat berkas";
                    saveOut = getContentResolver().openOutputStream(saveUri);
                    saveLoc = sub + "/" + saveName;
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(new Runnable() { public void run() { requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE); } });
                        return "Izinkan akses penyimpanan lalu coba simpan lagi";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(folder), "KLM Cut");
                    if (!dir.exists() && !dir.mkdirs()) return "Gagal membuat folder";
                    File f = new File(dir, saveName);
                    int k = 1;
                    String base = saveName, ext = "";
                    int dot = base.lastIndexOf('.');
                    if (dot > 0) { ext = base.substring(dot); base = base.substring(0, dot); }
                    while (f.exists()) f = new File(dir, base + " (" + (k++) + ")" + ext);
                    saveFile = f;
                    saveOut = new FileOutputStream(f);
                    saveLoc = folder + "/KLM Cut/" + f.getName();
                }
                return "ok";
            } catch (Exception e) {
                closeSave(false);
                return "Gagal menyimpan: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public synchronized void saveChunk(String b64) throws IOException {
            if (saveOut == null) throw new IOException("tidak ada berkas terbuka");
            saveOut.write(Base64.decode(b64, Base64.DEFAULT));
        }

        @JavascriptInterface
        public synchronized String saveEnd() {
            try {
                if (saveOut != null) saveOut.close();
                saveOut = null;
                if (saveUri != null) {
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(saveUri, cv, null, null);
                    }
                    lastUri = saveUri;
                    lastMime = saveMime;
                    saveUri = null;
                } else if (saveFile != null) {
                    final String m = saveMime;
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{saveFile.getAbsolutePath()}, new String[]{m},
                            new MediaScannerConnection.OnScanCompletedListener() {
                                public void onScanCompleted(String p, Uri uri) { if (uri != null) { lastUri = uri; lastMime = m; } }
                            });
                    saveFile = null;
                }
                return saveLoc;
            } catch (Exception e) {
                closeSave(false);
                return "";
            }
        }

        @JavascriptInterface
        public void keepScreen(final boolean on) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void shareLast() {
            final Uri u = lastUri;
            if (u == null) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType(lastMime);
                        i.putExtra(Intent.EXTRA_STREAM, u);
                        i.setClipData(ClipData.newRawUri("", u));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Bagikan video"));
                    } catch (Exception e) { /* abaikan */ }
                }
            });
        }

        /** Mengambil daftar file yang dibagikan dari aplikasi lain (JSON), lalu mengosongkan antrean. */
        @JavascriptInterface
        public String takeShared() {
            synchronized (lock) {
                StringBuilder sb = new StringBuilder("[");
                for (int k = 0; k < sharedQueue.size(); k++) {
                    String[] q = sharedQueue.get(k);
                    if (k > 0) sb.append(',');
                    sb.append("{\"url\":\"/__share/").append(q[0]).append("\",\"name\":").append(jstr(q[1])).append(",\"mime\":").append(jstr(q[2])).append('}');
                }
                sb.append(']');
                sharedQueue.clear();
                return sb.toString();
            }
        }
    }

    static String jstr(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }
}
