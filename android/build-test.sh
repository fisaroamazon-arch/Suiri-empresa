#!/usr/bin/env bash
set -euo pipefail

android=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project=$(cd "$android/.." && pwd)
output=${1:?Informe o caminho do APK de teste}
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}
if [[ ! -d "$sdk" ]]; then
  printf '%s\n' 'Configure ANDROID_SDK_ROOT com platform Android 35 e build-tools 35.0.0.' >&2
  exit 1
fi
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/assets/public" "$temp/res" "$temp/java" "$temp/classes" "$temp/dex"

if [[ -n ${SUIRI_ASSETS_APK:-} ]]; then
  python3 "$android/preparar-assets.py" "$project" "$temp/assets/public" "$SUIRI_ASSETS_APK"
else
  python3 "$android/preparar-assets.py" "$project" "$temp/assets/public"
fi
cp -r "$android/res/." "$temp/res/"
cp "$temp/assets/public/icon-192x192.png" "$temp/res/drawable/suiri.png"

"$tools/aapt2" compile --dir "$temp/res" -o "$temp/res.zip"
"$tools/aapt2" link -I "$platform" --manifest "$android/AndroidManifest.xml" \
  --min-sdk-version 29 --target-sdk-version 35 \
  --version-code "${SUIRI_VERSION_CODE:-43007}" --version-name "${SUIRI_VERSION_NAME:-4.3.0-teste.7}" \
  --rename-manifest-package br.com.suiri.empresateste --java "$temp/java" \
  -A "$temp/assets" -o "$temp/unsigned.apk" "$temp/res.zip"

mapfile -t sources < <(find "$android/src" "$temp/java" -name "*.java" -print)
java -m jdk.compiler/com.sun.tools.javac.Main -source 8 -target 8 -classpath "$platform" \
    -encoding UTF-8 -d "$temp/classes" "${sources[@]}"
mapfile -t classes < <(find "$temp/classes" -name "*.class" -print)
"$tools/d8" --lib "$platform" --min-api 29 --release --output "$temp/dex" "${classes[@]}"
python3 - "$temp/unsigned.apk" "$temp/dex/classes.dex" <<'PY'
import sys
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile(sys.argv[1], "a", compression=ZIP_DEFLATED) as apk:
    apk.write(sys.argv[2], "classes.dex")
PY
"$tools/zipalign" -f 4 "$temp/unsigned.apk" "$temp/aligned.apk"

keystore=${SUIRI_TEST_KEYSTORE:?Informe o caminho da chave de teste em SUIRI_TEST_KEYSTORE}
if [[ ! -f "$keystore" ]]; then
  keytool -genkeypair -keystore "$keystore" -storepass android -keypass android \
    -alias suiri-teste -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=Suíri Empresa Teste'
fi
mkdir -p "$(dirname "$output")"
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias suiri-teste --ks-pass pass:android \
    --key-pass pass:android --out "$output" "$temp/aligned.apk"
"$tools/apksigner" verify --verbose "$output"
