# GymLog

Android App (WebView Hülle + Offline Oberfläche). Oberfläche: `app/src/main/assets` (index.html, app.css, app.js). Java: `app/src/main/java/de/gymlog/app`.

* `assets/logic.js`: Trainingslogik ohne Oberfläche (Progression, Aufwärmen in %, Back-off, Wochen/Wiedereinstieg/Deload, Sätze pro Muskel). Neue Logik hierhin, mit Unit Tests.
* `assets/program.js`: der PPL-Plan als Vorlage, wird einmalig beim Start übernommen (`settings.seed`).
* Tests: `node --test tests/*.test.js`

## Nach jeder Änderung veröffentlichen
Die App aktualisiert sich selbst über `update/manifest.json` (geladen von raw.githubusercontent.com/laurinvalerian/gym/HEAD/update/).

1. Nur Oberfläche geändert: `python3 tools/publish.py "Was ist neu"` → committen, pushen. Kommt automatisch aufs Handy.
2. Java/Manifest geändert: vorher `versionCode`/`versionName` in `app/build.gradle` erhöhen, wenn die neue Oberfläche neue Bridge-Funktionen braucht auch `minNative` in `assets/version.json` auf den neuen versionCode setzen. Dann publish.py. Die App bietet die APK zur Installation an.

Neue Bridge-Aufrufe in app.js immer absichern (`Android.foo && Android.foo()`), damit ältere Installationen nicht abstürzen.
Signaturschlüssel `gymlog.keystore` nie ändern, sonst kann man nicht mehr drüber installieren.
Android SDK: `/opt/android-sdk` (build-tools 35, platform 35), bei Bedarf mit sdkmanager installieren.
