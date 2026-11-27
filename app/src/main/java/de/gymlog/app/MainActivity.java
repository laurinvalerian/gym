package de.gymlog.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.DocumentsContract;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    static volatile boolean foreground = false;

    private static final int REQ_EXPORT = 11;
    private static final int REQ_IMPORT = 12;
    private static final int REQ_TREE = 13;
    private static final String DATA_FILE = "gymlog.json";
    private static final String BACKUP_NAME = "GymLog-Backup.json";

    private WebView web;
    private String pendingExport;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("gymlog", MODE_PRIVATE);
        getWindow().setStatusBarColor(Color.parseColor("#0F1115"));
        getWindow().setNavigationBarColor(Color.parseColor("#0F1115"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F1115"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override protected void onResume() { super.onResume(); foreground = true; js("window.onAppResume && window.onAppResume()"); }
    @Override protected void onPause() { super.onPause(); foreground = false; }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", v -> {
            if (!"true".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    private void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    private static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case ' ': b.append("\\u2028"); break;
                case ' ': b.append("\\u2029"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toString("UTF-8");
    }

    private void writeAtomic(File f, String data) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write(data.getBytes(StandardCharsets.UTF_8));
            o.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new Exception("rename failed");
    }

    /** Daily snapshots inside app storage, last 30 kept. */
    private void snapshot(String data) {
        try {
            File dir = new File(getFilesDir(), "snapshots");
            dir.mkdirs();
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            writeAtomic(new File(dir, "gymlog-" + day + ".json"), data);
            File[] all = dir.listFiles((d, n) -> n.startsWith("gymlog-") && n.endsWith(".json"));
            if (all != null && all.length > 30) {
                Arrays.sort(all);
                for (int i = 0; i < all.length - 30; i++) all[i].delete();
            }
        } catch (Exception ignored) {}
    }

    /** Writes the backup file into the folder the user chose (survives uninstall). */
    private void writeToTree(String data) {
        String t = prefs.getString("tree", null);
        if (t == null) return;
        try {
            Uri tree = Uri.parse(t);
            String treeDoc = DocumentsContract.getTreeDocumentId(tree);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeDoc);
            Uri target = null;
            try (Cursor c = getContentResolver().query(children,
                    new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                    null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (BACKUP_NAME.equals(c.getString(1))) {
                        target = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                        break;
                    }
                }
            }
            if (target == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, treeDoc);
                target = DocumentsContract.createDocument(getContentResolver(), parent, "application/json", BACKUP_NAME);
            }
            try (OutputStream o = getContentResolver().openOutputStream(target, "wt")) {
                o.write(data.getBytes(StandardCharsets.UTF_8));
            }
            prefs.edit().putLong("treeLast", System.currentTimeMillis()).apply();
        } catch (Exception e) {
            prefs.edit().putString("treeErr", String.valueOf(e.getMessage())).apply();
        }
    }

    private PendingIntent timerIntent() {
        Intent i = new Intent(this, TimerReceiver.class);
        return PendingIntent.getBroadcast(this, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    class Bridge {
        @JavascriptInterface public String load() {
            try {
                File f = new File(getFilesDir(), DATA_FILE);
                if (!f.exists()) return "";
                return readAll(new FileInputStream(f));
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public boolean save(String data) {
            try {
                writeAtomic(new File(getFilesDir(), DATA_FILE), data);
                io.execute(() -> { snapshot(data); writeToTree(data); });
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface public void exportFile(String data, String name) {
            pendingExport = data;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(i, REQ_EXPORT);
        }

        @JavascriptInterface public void importFile() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            startActivityForResult(i, REQ_IMPORT);
        }

        @JavascriptInterface public void pickBackupFolder() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(i, REQ_TREE);
        }

        @JavascriptInterface public String backupInfo() {
            String t = prefs.getString("tree", null);
            if (t == null) return "";
            String name = Uri.decode(Uri.parse(t).getLastPathSegment());
            long last = prefs.getLong("treeLast", 0);
            return name + "|" + last;
        }

        @JavascriptInterface public void clearBackupFolder() { prefs.edit().remove("tree").remove("treeLast").apply(); }

        @JavascriptInterface public void startTimer(int seconds) {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            long at = SystemClock.elapsedRealtime() + seconds * 1000L;
            PendingIntent pi = timerIntent();
            am.cancel(pi);
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            }
        }

        @JavascriptInterface public void cancelTimer() {
            ((AlarmManager) getSystemService(Context.ALARM_SERVICE)).cancel(timerIntent());
            TimerReceiver.dismiss(MainActivity.this);
        }

        @JavascriptInterface public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            v.vibrate(VibrationEffect.createWaveform(new long[]{0, ms, 150, ms}, -1));
        }

        @JavascriptInterface public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (req == REQ_EXPORT && pendingExport != null) {
            String d = pendingExport; pendingExport = null;
            io.execute(() -> {
                try (OutputStream o = getContentResolver().openOutputStream(uri, "wt")) {
                    o.write(d.getBytes(StandardCharsets.UTF_8));
                    js("window.onNative && window.onNative('exported')");
                } catch (Exception e) { js("window.onNative && window.onNative('exportError')"); }
            });
        } else if (req == REQ_IMPORT) {
            io.execute(() -> {
                try {
                    String text = readAll(getContentResolver().openInputStream(uri));
                    js("window.onImport && window.onImport(" + quote(text) + ")");
                } catch (Exception e) { js("window.onNative && window.onNative('importError')"); }
            });
        } else if (req == REQ_TREE) {
            try {
                getContentResolver().takePersistableUriPermission(uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                prefs.edit().putString("tree", uri.toString()).apply();
                js("window.onNative && window.onNative('folderSet')");
            } catch (Exception e) { js("window.onNative && window.onNative('folderError')"); }
        }
    }
}
