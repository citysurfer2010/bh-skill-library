#!/usr/bin/env bash
# Installs the commit gate into an app: install-precommit.sh <app-folder>
# The hook is copied, not linked, because the skill is read-only in the container and a link dangles after the app moves.
set -euo pipefail

APP=${1:-.}
[ -d "$APP" ] || { echo "FEHLER: $APP ist kein Ordner" >&2; exit 1; }
APP=$(cd "$APP" && pwd)
[ "$(git -C "$APP" rev-parse --show-toplevel 2>/dev/null)" = "$APP" ] || { echo "FEHLER: $APP ist nicht die Wurzel eines Git-Repositories (git init?)" >&2; exit 1; }

SRC="$(cd "$(dirname "$0")" && pwd)/pre-commit-webapp-lint.sh"
HOOKS=$(git -C "$APP" rev-parse --git-path hooks)
case "$HOOKS" in /*) ;; *) HOOKS="$APP/$HOOKS" ;; esac
DST="$HOOKS/pre-commit"
mkdir -p "$HOOKS"

if [ -e "$DST" ] && ! grep -q 'BH-Commit-Gate' "$DST"; then
  echo "Hinweis: vorhandener Hook gesichert als $DST.bak"
  mv "$DST" "$DST.bak"
fi
install -m 755 "$SRC" "$DST"

echo "Commit-Gate installiert: $DST"
echo "Es blockt neue oder wachsende Dateien über 200 Zeilen, neue feste style=-Attribute, neue Browser-Popups und rote Validate-Tests."
