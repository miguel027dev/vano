#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT to an Android SDK with API 36 and build-tools 36.0.0}"
bt="$ANDROID_SDK_ROOT/build-tools/36.0.0"
platform="$ANDROID_SDK_ROOT/platforms/android-36/android.jar"
mkdir -p build/classes build/dex
java com.sun.tools.javac.Main -source 8 -target 8 -classpath "$platform" -d build/classes src/com/vano/maps/fluidez/*.java
"$bt/aapt2" compile --dir res -o build/resources.zip
"$bt/aapt2" link -o build/unsigned.apk --manifest AndroidManifest.xml -I "$platform" build/resources.zip
java sun.tools.jar.Main cf build/classes.jar -C build/classes .
"$bt/d8" --min-api 23 --lib "$platform" --output build/dex build/classes.jar
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/unsigned.apk','a') as z:z.write('build/dex/classes.dex','classes.dex')
PY
"$bt/zipalign" -f -P 16 4 build/unsigned.apk build/aligned.apk
# Candidate signing only; never substitutes for the Play upload/app signing key.
if [ ! -f build/candidate.keystore ]; then
  python3 -c 'import secrets,pathlib;pathlib.Path("build/signing-password").write_text(secrets.token_urlsafe(32))'
  chmod 600 build/signing-password
  java sun.security.tools.keytool.Main -genkeypair -keystore build/candidate.keystore -alias candidate -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=VANO Fluidez Candidate' -storepass:file build/signing-password -keypass:file build/signing-password
  chmod 600 build/candidate.keystore
fi
"$bt/apksigner" sign --ks build/candidate.keystore --ks-key-alias candidate --ks-pass file:build/signing-password --out build/VANO-Fluidez-2.7.0-rc1.apk build/aligned.apk
"$bt/apksigner" verify --verbose build/VANO-Fluidez-2.7.0-rc1.apk
"$bt/aapt2" dump badging build/VANO-Fluidez-2.7.0-rc1.apk
