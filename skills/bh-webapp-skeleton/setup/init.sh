#!/usr/bin/env bash
# Creates a new BH web app from the template.
#
#   init.sh <slug> "<Titel>" [--port N] [--base /pfad] [--label TEXT] [--description TEXT] [--dest PFAD]
#
# Target is ~/projects/<slug> (base changeable via BH_PROJECTS_DIR, --dest sets the full path).
# The script needs only bash, coreutils, sed and optionally git. The skill may be read-only, no sudo, no global installs.
set -euo pipefail

die() { echo "FEHLER: $*" >&2; exit 1; }
usage() { sed -n '4p' "$0" | sed 's/^# *//' >&2; exit 2; }

[ $# -ge 2 ] || usage
SLUG=$1; TITLE=$2; shift 2
PORT=3000; BASE=""; LABEL=""; DESCRIPTION=""; DEST=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --port) PORT=$2 ;;
    --base) BASE=$2 ;;
    --label) LABEL=$2 ;;
    --description) DESCRIPTION=$2 ;;
    --dest) DEST=$2 ;;
    *) usage ;;
  esac
  shift 2
done
LABEL=${LABEL:-$TITLE}; DESCRIPTION=${DESCRIPTION:-$TITLE}

# The slug becomes the folder, package and key name.
[[ $SLUG =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]] && [ ${#SLUG} -ge 2 ] && [ ${#SLUG} -le 41 ] \
  || die "Slug: 2 bis 41 Zeichen, Kleinbuchstaben, Ziffern, einzelne Bindestriche, Beginn mit Buchstabe ('$SLUG')"
# The test instance runs on port + 36000, so it must stay below 65536.
[[ $PORT =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 29534 ] || die "Port: Zahl von 1024 bis 29534 ('$PORT')"
[ -z "$BASE" ] || [[ $BASE =~ ^(/[a-z0-9-]+)+$ ]] || die "Base: leer oder wie /meine-app ('$BASE')"
# The texts end up in JS, JSON and HTML strings.
for v in "$TITLE" "$LABEL" "$DESCRIPTION"; do
  [ -n "$v" ] || die "Titel, Label und Beschreibung dürfen nicht leer sein"
  [ ${#v} -le 120 ] || die "Texte höchstens 120 Zeichen"
  case "$v" in *[\"\'\`\\\<\>\$]*|*$'\n'*|*$'\r'*) die "Texte dürfen keine Anführungszeichen, Backslashes, <, > oder \$ enthalten: $v" ;; esac
done

[ -n "$DEST" ] || DEST="${BH_PROJECTS_DIR:-${HOME:?HOME ist nicht gesetzt}/projects}/$SLUG"
{ [ -e "$DEST" ] || [ -L "$DEST" ]; } && die "$DEST existiert bereits, es wird nichts überschrieben"

SKILL_DIR=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE="$SKILL_DIR/templates/new-web-app/app"
[ -d "$TEMPLATE" ] || die "Template fehlt: $TEMPLATE"

mkdir -p "$(dirname "$DEST")"
TMP="$DEST.partial.$$"
trap 'rm -rf "$TMP"' EXIT
cp -R "$TEMPLATE" "$TMP"
# The skill is read-only, but the generated files must belong to the user and be writable.
chmod -R u+rwX "$TMP"

NS=$(printf '%s' "$SLUG" | awk -F- '{ for (i = 1; i <= NF; i++) printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2) }')
API_KEY_PREFIX="bh$(printf '%s' "$SLUG" | tr -cd 'a-z0-9' | cut -c1-3)_"
# In sed replacements &, | and \ have a special meaning.
esc() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }

while IFS= read -r -d '' f; do
  sed -i \
    -e "s|__SLUG__|$SLUG|g" \
    -e "s|__APP_NAME__|$(esc "$TITLE")|g" \
    -e "s|__APP_BASE__|$BASE|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__NS__|$NS|g" \
    -e "s|__SHORT_LABEL__|$(esc "$LABEL")|g" \
    -e "s|__DESCRIPTION__|$(esc "$DESCRIPTION")|g" \
    -e "s|__API_KEY_PREFIX__|$API_KEY_PREFIX|g" \
    "$f"
done < <(grep -rlIZE '__(SLUG|APP_NAME|APP_BASE|PORT|NS|SHORT_LABEL|DESCRIPTION|API_KEY_PREFIX)__' "$TMP")

while IFS= read -r -d '' f; do mv "$f" "${f%.tmpl}"; done < <(find "$TMP" -type f -name '*.tmpl' -print0)
find "$TMP" -type f -name '*.sh' -exec chmod +x {} +

if left=$(grep -rnIE '__(SLUG|APP_NAME|APP_BASE|PORT|NS|SHORT_LABEL|DESCRIPTION|API_KEY_PREFIX)__' "$TMP"); then
  die "Platzhalter nicht ersetzt: $left"
fi

mv -T "$TMP" "$DEST"
trap - EXIT

if command -v git >/dev/null 2>&1; then
  git -C "$DEST" init -q -b main
  bash "$SKILL_DIR/setup/install-precommit.sh" "$DEST"
else
  echo "Hinweis: git nicht gefunden, kein Repository und kein Pre-Commit-Hook angelegt."
fi

echo "Angelegt: $DEST"
echo
echo "Weiter:"
echo "  1. cd $DEST && npm install"
echo "  2. npm test                 # alle Pflicht-Suiten müssen grün sein"
echo "  3. PRODUCT_CONTEXT.md ausfüllen (10 Abschnitte)"
echo "  4. DEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start"
