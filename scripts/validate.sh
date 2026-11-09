#!/usr/bin/env bash
# Checks skill headers and searches for accidentally committed secrets.
set -u
cd "$(dirname "$0")/.."
fail=0
for f in skills/*/SKILL.md; do
  dir=$(basename "$(dirname "$f")")
  name=$(sed -n 's/^name: *//p' "$f" | head -1)
  [ "$name" = "$dir" ] || { echo "FEHLER $f: name '$name' passt nicht zum Ordner"; fail=1; }
  [[ $name =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "FEHLER $f: ungueltiger Name"; fail=1; }
  grep -q '^description: *.' "$f" || { echo "FEHLER $f: description fehlt"; fail=1; }
done
# Versions: YY.M.N, see platform/image/CODING-RULES.md
vok='^[0-9]{2}\.([1-9]|1[0-2])\.[1-9][0-9]*$'
ver() { grep -oE '"version": *"[^"]+"' "$1" | head -1 | sed -E 's/.*"([^"]+)"$/\1/'; }
for m in skills/*/manifest.json apps/*/package.json; do
  v=$(ver "$m"); [[ $v =~ $vok ]] || { echo "FEHLER $m: Version '$v' ist nicht JJ.M.N"; fail=1; }
done
for p in skills/*/server/package.json; do
  m="$(dirname "$(dirname "$p")")/manifest.json"
  [ "$(ver "$p")" = "$(ver "$m")" ] || { echo "FEHLER $p: Version weicht vom Manifest ab"; fail=1; }
  s="$(dirname "$p")/server.js"
  grep -q serverInfo "$s" 2>/dev/null || continue
  grep -q "version: *'$(ver "$m")'" "$s" || { echo "FEHLER $s: Version weicht vom Manifest ab"; fail=1; }
done
c=$(sed -nE 's/.*[^a-z]version="([^"]+)" viewmodes.*/\1/p' skills/bh-beamer/app/config.xml | head -1)
[ "$c" = "$(ver skills/bh-beamer/manifest.json)" ] || { echo "FEHLER BH Screen: Version '$c' weicht vom Manifest ab"; fail=1; }
# Icons: see "Icons und Favicon" in skills/bh-webapp-skeleton/SKILL.md
logo=skills/bh-styleguide/assets/logo/bh-logo.svg
tpl=skills/bh-webapp-skeleton/templates/new-web-app/app/public
for d in "$tpl" skills/bh-auth/server/public apps/*/public; do
  cmp -s "$d/favicon.svg" "$logo" || { echo "FEHLER $d/favicon.svg weicht vom Logo ab"; fail=1; }
done
for d in "$tpl" skills/bh-auth/server/public apps/*/public; do
  for f in favicon.svg branding/icon-192.png branding/icon-512.png branding/icon-maskable-512.png branding/apple-touch-icon.png; do
    [ -f "$d/$f" ] || { echo "FEHLER $d/$f fehlt"; fail=1; }
  done
  [ -f "$d/manifest.webmanifest" ] || [ -f "$d/manifest.webmanifest.tmpl" ] || { echo "FEHLER $d: Manifest fehlt"; fail=1; }
done
pattern='BEGIN [A-Z ]*PRIVATE KEY|sk-mel-[A-Za-z0-9_-]{12}|sk-[A-Za-z0-9]{24}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|GOCSPX-[A-Za-z0-9_-]{10}'
if grep -rnIE --exclude=validate.sh --exclude-dir=.git --exclude-dir=node_modules "$pattern" .; then
  echo "FEHLER: moegliches Geheimnis gefunden"; fail=1
fi
[ "$fail" = 0 ] && echo "ok"
exit "$fail"
