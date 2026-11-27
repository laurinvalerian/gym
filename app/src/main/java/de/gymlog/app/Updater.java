package de.gymlog.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Selbst-Update: lädt neue Oberflächen-Versionen (HTML/JS/CSS) still im Hintergrund
 * und bietet neue APK-Versionen zur Installation an. Ohne Internet passiert nichts.
 */
public class Updater {
    static final String BASE = "https://raw.githubusercontent.com/laurinvalerian/gym/HEAD/update/";

    final Context ctx;
    final SharedPreferences prefs;

    Updater(Context ctx) {
        this.ctx = ctx;
        this.prefs = ctx.getSharedPreferences("gymlog", Context.MODE_PRIVATE);
    }

    long nativeVersion() {
        try { return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).getLongVersionCode(); }
        catch (Exception e) { return 0; }
    }

    int bundledWeb() {
        try { return new JSONObject(readStr(ctx.getAssets().open("version.json"))).getInt("web"); }
        catch (Exception e) { return 0; }
    }

    File webDir() { return new File(ctx.getFilesDir(), "web"); }

    int downloadedWeb() {
        if (!new File(webDir(), "index.html").exists()) return 0;
        if (prefs.getLong("webNative", -1) != nativeVersion() && prefs.getInt("webVersion", 0) <= bundledWeb()) return 0;
        return prefs.getInt("webVersion", 0);
    }

    int currentWeb() { return Math.max(bundledWeb(), downloadedWeb()); }

    String startUrl() {
        if (downloadedWeb() > bundledWeb()) return "file://" + new File(webDir(), "index.html").getAbsolutePath();
        return "file:///android_asset/index.html";
    }

    static String readStr(InputStream in) throws Exception { return new String(readBytes(in), "UTF-8"); }

    static byte[] readBytes(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    static byte[] get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        c.setUseCaches(false);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            return readBytes(c.getInputStream());
        } finally { c.disconnect(); }
    }

    static String sha256(byte[] b) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(b);
        StringBuilder s = new StringBuilder();
        for (byte x : d) s.append(String.format("%02x", x));
        return s.toString();
    }

    static void deleteRec(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRec(k);
        f.delete();
    }

    JSONObject manifest() throws Exception {
        return new JSONObject(new String(get(BASE + "manifest.json?t=" + System.currentTimeMillis()), "UTF-8"));
    }

    /** Lädt eine neue Oberfläche, falls vorhanden. Gibt die neue Version zurück, sonst 0. */
    int updateWeb(JSONObject m) throws Exception {
        int ver = m.getInt("web");
        if (ver <= currentWeb() || m.optLong("minNative", 0) > nativeVersion()) return 0;
        File tmp = new File(ctx.getFilesDir(), "web_tmp");
        deleteRec(tmp);
        tmp.mkdirs();
        JSONArray files = m.getJSONArray("files");
        for (int i = 0; i < files.length(); i++) {
            JSONObject f = files.getJSONObject(i);
            String name = f.getString("name");
            if (name.contains("..") || name.startsWith("/")) throw new Exception("bad name");
            byte[] data = get(BASE + "web/" + name + "?v=" + ver);
            if (!sha256(data).equals(f.getString("sha256"))) throw new Exception("hash mismatch " + name);
            File out = new File(tmp, name);
            out.getParentFile().mkdirs();
            try (FileOutputStream o = new FileOutputStream(out)) { o.write(data); }
        }
        File dir = webDir(), old = new File(ctx.getFilesDir(), "web_old");
        deleteRec(old);
        if (dir.exists() && !dir.renameTo(old)) throw new Exception("swap failed");
        if (!tmp.renameTo(dir)) { old.renameTo(dir); throw new Exception("swap failed"); }
        deleteRec(old);
        prefs.edit().putInt("webVersion", ver).putLong("webNative", nativeVersion()).apply();
        return ver;
    }

    /** APK herunterladen und System-Installationsdialog öffnen. */
    void installApk(JSONObject m) throws Exception {
        byte[] apk = get(BASE + m.getString("apk") + "?v=" + m.getLong("apkVersion"));
        if (m.has("apkSha256") && !sha256(apk).equals(m.getString("apkSha256"))) throw new Exception("hash mismatch apk");
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(ctx.getPackageName());
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (OutputStream o = s.openWrite("app.apk", 0, apk.length)) {
                o.write(apk);
                s.fsync(o);
            }
            Intent i = new Intent(ctx, InstallReceiver.class);
            PendingIntent cb = PendingIntent.getBroadcast(ctx, id, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            s.commit(cb.getIntentSender());
        }
    }
}
