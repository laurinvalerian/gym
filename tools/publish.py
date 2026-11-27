#!/usr/bin/env python3
"""Veröffentlicht eine neue Version für das Selbst-Update der App.

Aufruf:  python3 tools/publish.py "Kurze Beschreibung der Änderung"

* erhöht den Oberflächen-Stand (assets/version.json -> web)
* baut die signierte APK
* legt alles unter update/ ab (manifest.json, web/, GymLog.apk)
Danach committen und pushen: die App holt sich das Update beim nächsten Online-Start.
Oberflächen-Änderungen (assets) kommen automatisch ohne Neuinstallation.
Bei Änderungen am Java-Code vorher versionCode in app/build.gradle erhöhen:
dann bietet die App die neue APK zur Installation an.
"""
import hashlib, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'app/src/main/assets')
UPD = os.path.join(ROOT, 'update')
notes = sys.argv[1] if len(sys.argv) > 1 else ''

vpath = os.path.join(ASSETS, 'version.json')
ver = json.load(open(vpath))
ver['web'] += 1
json.dump(ver, open(vpath, 'w'))

gradle = open(os.path.join(ROOT, 'app/build.gradle')).read()
vcode = int(re.search(r'versionCode (\d+)', gradle).group(1))
vname = re.search(r"versionName '([^']+)'", gradle).group(1)

env = dict(os.environ, ANDROID_HOME=os.environ.get('ANDROID_HOME', '/opt/android-sdk'))
subprocess.run(['gradle', '--no-daemon', '-q', 'assembleRelease'], cwd=ROOT, env=env, check=True)
apk_src = os.path.join(ROOT, 'app/build/outputs/apk/release/app-release.apk')

shutil.rmtree(os.path.join(UPD, 'web'), ignore_errors=True)
os.makedirs(os.path.join(UPD, 'web'))
files = []
for name in sorted(os.listdir(ASSETS)):
    src = os.path.join(ASSETS, name)
    if not os.path.isfile(src):
        continue
    shutil.copy(src, os.path.join(UPD, 'web', name))
    files.append({'name': name, 'sha256': hashlib.sha256(open(src, 'rb').read()).hexdigest()})
shutil.copy(apk_src, os.path.join(UPD, 'GymLog.apk'))
os.makedirs(os.path.join(ROOT, 'release'), exist_ok=True)
shutil.copy(apk_src, os.path.join(ROOT, 'release/GymLog.apk'))
manifest = {
    'web': ver['web'], 'minNative': ver.get('minNative', 0), 'files': files,
    'apk': 'GymLog.apk', 'apkVersion': vcode, 'apkVersionName': vname,
    'apkSha256': hashlib.sha256(open(apk_src, 'rb').read()).hexdigest(), 'notes': notes,
}
json.dump(manifest, open(os.path.join(UPD, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print(f"Veröffentlicht: Oberfläche Stand {ver['web']}, App {vname} ({vcode})")
