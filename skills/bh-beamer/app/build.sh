#!/usr/bin/env bash
# Paketiert und installiert BH Screen vom Mac aus. Voraussetzungen: Tizen Studio mit Zertifikatsprofil "BH",
# Beamer im Entwicklermodus mit der IP dieses Macs als Entwickler-Rechner.
#   build.sh <screen-url> <beamer-ip>      z. B. build.sh https://apps.example.de/screen/<token> 192.168.2.139
set -euo pipefail
cd "$(dirname "$0")"
URL=${1:?screen-url fehlt}; IP=${2:?beamer-ip fehlt}; PROFILE=${PROFILE:-BH}
T=${TIZEN_CLI:-$HOME/tizen-studio/tools/ide/bin/tizen}; S=${SDB:-$HOME/tizen-studio/tools/sdb}
[ -x "$T" ] && [ -x "$S" ] || { echo "Tizen Studio nicht gefunden (TIZEN_CLI/SDB setzen)" >&2; exit 1; }
[[ $URL =~ ^https://[^\"\'\\]+$ ]] || { echo "screen-url muss mit https beginnen" >&2; exit 1; }
printf "window.BH_SCREEN_URL = '%s';\n" "$URL" > config.js
rm -rf .buildResult BHScreen.wgt
"$T" build-web -e '*.sh' -e '.buildResult/*' -- . >/dev/null
"$T" package -t wgt -s "$PROFILE" -- .buildResult >/dev/null
mv .buildResult/*.wgt BHScreen.wgt
"$S" connect "$IP:26101" >/dev/null
"$T" install -n BHScreen.wgt -t "$IP:26101"
echo "Installiert. Start zum Test: $S -s $IP:26101 shell 0 was_execute bhscreen01.BHScreen"
