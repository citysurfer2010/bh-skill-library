#!/usr/bin/env bash
# Erzeugt eine neue App aus dem Template: new-app.sh <slug> "<Titel>" [port] [zielordner]
set -euo pipefail
slug=${1:-}; title=${2:-}; port=${3:-3000}; dest=${4:-$HOME/projects/$slug}
[[ $slug =~ ^[a-z][a-z0-9-]{1,40}$ ]] || { echo "Slug: Kleinbuchstaben, Ziffern, Bindestriche" >&2; exit 1; }
[ -n "$title" ] || { echo "Titel fehlt" >&2; exit 1; }
[[ $title != *[\|\&\\]* ]] || { echo "Titel darf | & \\ nicht enthalten" >&2; exit 1; }
[[ $port =~ ^[0-9]+$ ]] || { echo "Port muss eine Zahl sein" >&2; exit 1; }
[ ! -e "$dest" ] || { echo "$dest existiert bereits" >&2; exit 1; }
here=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$(dirname "$dest")"
cp -r "$here/template" "$dest"
find "$dest" -type f -exec sed -i "s|{{SLUG}}|$slug|g; s|{{TITLE}}|$title|g; s|{{PORT}}|$port|g" {} +
chmod -R u+w "$dest"
chmod +x "$dest/test/run-all.sh"
git -C "$dest" init -q -b main
echo "Angelegt: $dest"
echo "Weiter: cd $dest && npm install && npm test"
