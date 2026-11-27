package de.gymlog.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Sicherung in ein PRIVATES GitHub-Repo (Contents API). Jede Sicherung ist ein Commit,
 * so bleiben alle früheren Stände erhalten. Der Token bleibt nur in den App-Einstellungen
 * auf dem Handy und landet nie in den gesicherten Daten.
 */
class GitHubBackup {
    static final String PATH = "gymlog.json";
    final SharedPreferences prefs;

    GitHubBackup(Context ctx) { prefs = ctx.getSharedPreferences("gymlog", Context.MODE_PRIVATE); }

    boolean configured() { return prefs.getString("ghRepo", null) != null && prefs.getString("ghToken", null) != null; }

    static class HttpErr extends Exception { final int code; HttpErr(int c, String m) { super(m); code = c; } }

    private String call(String method, String path, String body, String accept, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com" + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(10000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", accept != null ? accept : "application/vnd.github+json");
        c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        c.setRequestProperty("User-Agent", "GymLog-App");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        String text = "";
        if (in != null) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            text = bo.toString("UTF-8");
        }
        c.disconnect();
        if (code >= 400) throw new HttpErr(code, text);
        return text;
    }

    /** Prüft Zugriff. Öffentliche Repos werden abgelehnt, damit deine Daten nie öffentlich werden. */
    String connect(String repo, String token) {
        repo = repo.trim().replaceAll("^https?://github.com/", "").replaceAll("/+$", "");
        token = token.trim();
        if (!repo.matches("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")) return "Repo bitte als besitzer/name angeben, z.B. laurinvalerian/gym-daten";
        try {
            JSONObject r = new JSONObject(call("GET", "/repos/" + repo, null, null, token));
            if (!r.optBoolean("private", false)) return "Das Repo ist öffentlich. Für deine Daten bitte ein PRIVATES Repo verwenden.";
            JSONObject perm = r.optJSONObject("permissions");
            if (perm != null && !perm.optBoolean("push", true)) return "Der Token darf in dieses Repo nicht schreiben (Contents: Read and write).";
        } catch (HttpErr e) {
            if (e.code == 401) return "Token ungültig oder abgelaufen.";
            if (e.code == 404) return "Repo nicht gefunden oder der Token hat keinen Zugriff darauf.";
            return "GitHub-Fehler " + e.code;
        } catch (Exception e) {
            return "Keine Verbindung zu GitHub.";
        }
        prefs.edit().putString("ghRepo", repo).putString("ghToken", token).remove("ghSha").remove("ghErr").apply();
        return "";
    }

    void disconnect() { prefs.edit().remove("ghRepo").remove("ghToken").remove("ghSha").remove("ghLast").remove("ghErr").apply(); }

    private String fetchSha(String repo, String token) throws Exception {
        try {
            return new JSONObject(call("GET", "/repos/" + repo + "/contents/" + PATH, null, null, token)).optString("sha", null);
        } catch (HttpErr e) {
            if (e.code == 404) return null;
            throw e;
        }
    }

    /** Lädt den aktuellen Stand hoch (ein Commit). */
    synchronized boolean push(String data) {
        String repo = prefs.getString("ghRepo", null), token = prefs.getString("ghToken", null);
        if (repo == null || token == null) return false;
        String msg = "Sicherung " + new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.GERMANY).format(new Date());
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                String sha = prefs.getString("ghSha", null);
                if (sha == null || attempt > 0) sha = fetchSha(repo, token);
                JSONObject body = new JSONObject();
                body.put("message", msg);
                body.put("content", Base64.encodeToString(data.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
                if (sha != null) body.put("sha", sha);
                JSONObject r = new JSONObject(call("PUT", "/repos/" + repo + "/contents/" + PATH, body.toString(), null, token));
                String newSha = r.getJSONObject("content").getString("sha");
                prefs.edit().putString("ghSha", newSha).putLong("ghLast", System.currentTimeMillis()).putString("ghErr", "").apply();
                return true;
            } catch (HttpErr e) {
                if ((e.code == 409 || e.code == 422) && attempt == 0) continue; // Stand im Repo hat sich geändert: sha neu holen
                prefs.edit().putString("ghErr", e.code == 401 ? "Token ungültig oder abgelaufen" : "GitHub-Fehler " + e.code).apply();
                return false;
            } catch (Exception e) {
                prefs.edit().putString("ghErr", "offline").apply();
                return false;
            }
        }
        return false;
    }

    /** Holt den gesicherten Stand. */
    String pull() throws Exception {
        String repo = prefs.getString("ghRepo", null), token = prefs.getString("ghToken", null);
        return call("GET", "/repos/" + repo + "/contents/" + PATH, null, "application/vnd.github.raw+json", token);
    }

    String info() {
        String repo = prefs.getString("ghRepo", null);
        if (repo == null) return "";
        return repo + "|" + prefs.getLong("ghLast", 0) + "|" + prefs.getString("ghErr", "");
    }
}
