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
# Services keep their code in services/ and their version in the manifest of the matching skill.
for p in services/*/package.json; do
  m="skills/$(basename "$(dirname "$p")")/manifest.json"
  [ -f "$m" ] || { echo "FEHLER $p: $m fehlt"; fail=1; continue; }
  [ "$(ver "$p")" = "$(ver "$m")" ] || { echo "FEHLER $p: Version weicht vom Manifest ab"; fail=1; }
done
c=$(sed -nE 's/.*[^a-z]version="([^"]+)" viewmodes.*/\1/p' skills/bh-beamer/app/config.xml | head -1)
[ "$c" = "$(ver skills/bh-beamer/manifest.json)" ] || { echo "FEHLER BH Screen: Version '$c' weicht vom Manifest ab"; fail=1; }
# Icons: see "Icons und Favicon" in skills/bh-webapp-skeleton/SKILL.md
logo=skills/bh-styleguide/assets/logo/bh-logo.svg
tpl=skills/bh-webapp-skeleton/templates/new-web-app/app/public
cmp -s services/bh-auth/public/favicon.svg "$logo" || { echo "FEHLER: Favicon der Plattform weicht vom Logo ab"; fail=1; }
# Every app has its own motif on the shared tile; the B stays with the platform.
seen=" "
for d in apps/*/public; do
  grep -q 'stop-color="#172554"' "$d/favicon.svg" || { echo "FEHLER $d/favicon.svg: Kachel im Plattform-Stil fehlt"; fail=1; }
  cmp -s "$d/favicon.svg" "$logo" && { echo "FEHLER $d/favicon.svg: App braucht ein eigenes Motiv"; fail=1; }
  h=$(sha256sum "$d/favicon.svg" | cut -c1-16)
  case "$seen" in *" $h "*) echo "FEHLER $d/favicon.svg: gleiches Motiv wie eine andere App"; fail=1 ;; esac
  seen="$seen$h "
done
for d in "$tpl" services/bh-auth/public apps/*/public; do
  for f in favicon.svg branding/icon-192.png branding/icon-512.png branding/icon-maskable-512.png branding/apple-touch-icon.png; do
    [ -f "$d/$f" ] || { echo "FEHLER $d/$f fehlt"; fail=1; }
  done
  [ -f "$d/manifest.webmanifest" ] || [ -f "$d/manifest.webmanifest.tmpl" ] || { echo "FEHLER $d: Manifest fehlt"; fail=1; }
done
pattern='BEGIN [A-Z ]*PRIVATE KEY|sk-mel-[A-Za-z0-9_-]{12}|sk-[A-Za-z0-9]{24}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|GOCSPX-[A-Za-z0-9_-]{10}'
if grep -rnIE --exclude=validate.sh --exclude-dir=.git --exclude-dir=node_modules "$pattern" .; then
  echo "FEHLER: moegliches Geheimnis gefunden"; fail=1
fi
# Public repository: no family e-mail addresses, home network addresses or device MACs in tracked files (Matti 15.11.2026).
# Real values belong in /srv/bh-platform/.env; docs and tests use placeholders (192.0.2.x, 00:11:22:33:44:55).
priv=$(git ls-files -z | grep -zv -e '^platform/host/daemon.json$' -e '^platform/host/devbox-firewall.sh$' -e 'package-lock.json$' \
  | xargs -0 grep -I -l -E '[A-Za-z0-9._%+-]+@familiebiskup\.de|\b(192\.168|10\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}\b|\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b' 2>/dev/null \
  | grep -v -E '(^|/)node_modules/' || true)
for f in $priv; do
  grep -I -q -E '\b00:11:22:33:44:55\b' "$f" && ! grep -I -q -E '[A-Za-z0-9._%+-]+@familiebiskup\.de|\b(192\.168|10\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}\b' "$f" && [ "$(grep -I -o -E '\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b' "$f" | sort -u)" = "00:11:22:33:44:55" ] && continue
  echo "FEHLER $f: private Adresse (E-Mail, Heimnetz-IP oder MAC) im öffentlichen Repo, in die .env verschieben"; fail=1
done
[ "$fail" = 0 ] && echo "ok"
exit "$fail"
