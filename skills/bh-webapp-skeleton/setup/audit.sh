#!/usr/bin/env bash
# Prüft, ob eine App alle Pflicht-Artefakte hat: audit.sh <app-ordner>. Exit 1, wenn etwas fehlt.
set -u
APP=${1:-.}
[ -d "$APP" ] || { echo "FEHLER: $APP ist kein Ordner" >&2; exit 2; }
missing=0
for f in PRODUCT_CONTEXT.md DEVELOPMENT.md LIMITATIONS.md .c8rc.json test/run-all.sh \
  test/validate.test.js test/smoke.test.js test/rbac.test.js test/restart.test.js test/e2e.test.js \
  test/no-native-select.test.js test/no-blocking-resources.test.js test/no-bare-table.test.js test/branding.test.js \
  lib/auth.js public/css/tokens.css; do
  if [ -f "$APP/$f" ]; then echo "ok    $f"; else echo "FEHLT $f"; missing=1; fi
done
hooks=$(git -C "$APP" rev-parse --git-path hooks 2>/dev/null || true)
case "$hooks" in /*) ;; *) hooks="$APP/$hooks" ;; esac
if grep -qs 'BH-Commit-Gate' "$hooks/pre-commit"; then echo "ok    pre-commit-Hook"; else echo "FEHLT pre-commit-Hook (setup/install-precommit.sh)"; missing=1; fi
exit "$missing"
