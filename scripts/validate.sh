#!/usr/bin/env bash
# Prueft Skill-Koepfe und sucht nach versehentlich eingecheckten Geheimnissen.
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
pattern='BEGIN [A-Z ]*PRIVATE KEY|sk-mel-[A-Za-z0-9_-]{12}|sk-[A-Za-z0-9]{24}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|GOCSPX-[A-Za-z0-9_-]{10}'
if grep -rnIE --exclude=validate.sh --exclude-dir=.git --exclude-dir=node_modules "$pattern" .; then
  echo "FEHLER: moegliches Geheimnis gefunden"; fail=1
fi
[ "$fail" = 0 ] && echo "ok"
exit "$fail"
