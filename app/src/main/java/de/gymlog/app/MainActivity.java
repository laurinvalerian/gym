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
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.provider.Settings;
import org.json.JSONObject;
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
    private static final int REQ_BFILE = 14;
    private volatile String pendingBackup = null;
    private volatile boolean backupQueued = false;
    private static final String DATA_FILE = "gymlog.json";
    private static final String BACKUP_NAME = "GymLog-Backup.json";

    private WebView web;
    private String pendingExport;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private Updater updater;
    private volatile JSONObject pendingManifest;
    private volatile boolean checking = false;
    private long lastCheck = 0;

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
        // Systemleisten (Statusleiste oben, Navigationsleiste unten, Tastatur) freihalten
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0F1115"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = b.top; left = b.left; right = b.right; bottom = Math.max(b.bottom, ime.bottom);
            } else {
                top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft(); right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
        setContentView(root);
        updater = new Updater(this);
        web.loadUrl(updater.startUrl());

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override protected void onResume() {
        super.onResume(); foreground = true;
        js("window.onAppResume && window.onAppResume()");
        if (System.currentTimeMillis() - lastCheck > 60 * 1000L) checkUpdates(false);
    }

    /** Prüft online auf neue Version. Ohne Internet passiert einfach nichts. */
    private void checkUpdates(boolean manual) {
        if (checking) return;
        checking = true;
        io.execute(() -> {
            try {
                JSONObject m = updater.manifest();
                lastCheck = System.currentTimeMillis();
                int web = 0;
                try { web = updater.updateWeb(m); } catch (Exception e) { if (manual) js("window.onNative && window.onNative('updateError')"); }
                if (web > 0) js("window.onUpdateReady && window.onUpdateReady(" + web + ")");
                if (m.optLong("apkVersion", 0) > updater.nativeVersion()) {
                    pendingManifest = m;
                    js("window.onApkUpdate && window.onApkUpdate(" + quote(m.optString("apkVersionName", "")) + "," + quote(m.optString("notes", "")) + ")");
                } else if (manual && web == 0) js("window.onNative && window.onNative('upToDate')");
            } catch (Exception e) {
                if (manual) js("window.onNative && window.onNative('offline')");
            } finally { checking = false; }
        });
    }

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

    private static String readValid(File f) {
        try {
            if (!f.exists()) return null;
            String t = readAll(new FileInputStream(f));
            new JSONObject(t);
            return t;
        } catch (Exception e) { return null; }
    }

    /** Leerer Stand (keine Daten) darf nie eine Sicherung überschreiben. */
    private static boolean hasContent(String data) {
        try {
            JSONObject o = new JSONObject(data);
            String[] keys = {"weights", "workouts", "plans", "exercises"};
            for (String k : keys) if (o.optJSONArray(k) != null && o.optJSONArray(k).length() > 0) return true;
        } catch (Exception ignored) {}
        return false;
    }

    /** Sammelt Änderungen und schreibt nur den neuesten Stand nach außen. */
    private void queueBackup(String data) {
        pendingBackup = data;
        if (backupQueued) return;
        backupQueued = true;
        io.execute(() -> {
            backupQueued = false;
            String d = pendingBackup;
            if (d == null) return;
            if (!hasContent(d)) return;
            snapshot(d);
            writeToFile(d);
            writeToTree(d);
        });
    }

    private void writeToFile(String data) {
        String f = prefs.getString("bfile", null);
        if (f == null) return;
        Exception last = null;
        for (String mode : new String[]{"wt", "rwt"}) {
            try (OutputStream o = getContentResolver().openOutputStream(Uri.parse(f), mode)) {
                o.write(data.getBytes(StandardCharsets.UTF_8));
                o.flush();
                prefs.edit().putLong("bfileLast", System.currentTimeMillis()).putString("bfileErr", "").apply();
                return;
            } catch (Exception e) { last = e; }
        }
        prefs.edit().putString("bfileErr", String.valueOf(last == null ? "?" : last.getMessage())).apply();
    }

    private PendingIntent timerIntent() {
        Intent i = new Intent(this, TimerReceiver.class);
        return PendingIntent.getBroadcast(this, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    class Bridge {
        @JavascriptInterface public String load() {
            // Hauptdatei; falls kaputt: neueste gültige Tageskopie
            String main = readValid(new File(getFilesDir(), DATA_FILE));
            if (main != null) return main;
            File[] snaps = new File(getFilesDir(), "snapshots").listFiles((d, n) -> n.endsWith(".json"));
            if (snaps != null) {
                Arrays.sort(snaps);
                for (int i = snaps.length - 1; i >= 0; i--) { String t = readValid(snaps[i]); if (t != null) return t; }
            }
            return "";
        }

        @JavascriptInterface public boolean save(String data) {
            try {
                writeAtomic(new File(getFilesDir(), DATA_FILE), data);
                queueBackup(data);
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

        /** Sicherungsdatei anlegen, z.B. in Google Drive. Wird danach bei jeder Änderung überschrieben. */
        @JavascriptInterface public void pickBackupFile() {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, "GymLog-Backup.json");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(i, REQ_BFILE);
        }

        /** Ort|zuletztGesichert|Fehler */
        @JavascriptInterface public String backupInfo() {
            String f = prefs.getString("bfile", null);
            if (f != null) {
                Uri u = Uri.parse(f);
                String where = u.getAuthority() != null && u.getAuthority().contains("google.android.apps.docs") ? "Google Drive" : "Datei";
                return where + " · " + prefs.getString("bfileName", "GymLog-Backup.json") + "|" + prefs.getLong("bfileLast", 0) + "|" + prefs.getString("bfileErr", "");
            }
            String t = prefs.getString("tree", null);
            if (t == null) return "";
            return "Ordner " + Uri.decode(Uri.parse(t).getLastPathSegment()) + "|" + prefs.getLong("treeLast", 0) + "|";
        }

        @JavascriptInterface public void backupNow() {
            String d = load();
            if (!d.isEmpty()) queueBackup(d);
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

        @JavascriptInterface public String versionInfo() {
            String name = "";
            try { name = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignored) {}
            return name + "|" + updater.currentWeb();
        }

        @JavascriptInterface public void checkUpdates() { MainActivity.this.checkUpdates(true); }

        @JavascriptInterface public void reloadApp() { runOnUiThread(() -> web.loadUrl(updater.startUrl())); }

        @JavascriptInterface public void installUpdate() {
            if (!getPackageManager().canRequestPackageInstalls()) {
                js("window.onNative && window.onNative('needInstallPermission')");
                runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))));
                return;
            }
            JSONObject m = pendingManifest;
            if (m == null) { MainActivity.this.checkUpdates(true); return; }
            js("window.onNative && window.onNative('downloading')");
            io.execute(() -> {
                try { updater.installApk(m); }
                catch (Exception e) { js("window.onNative && window.onNative('updateError')"); }
            });
        }

        @JavascriptInterface public void scheduleReminder(double at) { ReminderReceiver.schedule(MainActivity.this, (long) at); }

        @JavascriptInterface public void cancelReminder() { ReminderReceiver.cancel(MainActivity.this); }

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
        } else if (req == REQ_BFILE) {
            try {
                getContentResolver().takePersistableUriPermission(uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception ignored) { /* manche Anbieter erlauben nur Schreiben ohne dauerhafte Freigabe */ }
            String name = "GymLog-Backup.json";
            try (Cursor c = getContentResolver().query(uri, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) {}
            prefs.edit().putString("bfile", uri.toString()).putString("bfileName", name).remove("bfileErr").apply();
            io.execute(() -> {
                String d = readValid(new File(getFilesDir(), DATA_FILE));
                if (d != null) writeToFile(d);
                js("window.onNative && window.onNative('" + (prefs.getString("bfileErr", "").isEmpty() ? "fileSet" : "fileError") + "')");
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
