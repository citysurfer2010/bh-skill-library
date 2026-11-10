#!/usr/bin/env bash
# Run once on the Mac: copies iCloud photos to the Synology and keeps them in sync every night.
# The Apple password is typed only here and stays in the macOS keychain. Nothing is ever deleted in iCloud.
set -euo pipefail

NAS=192.168.2.136; SHARE=photo; TARGET=iCloud-Matti; MOUNT="/Volumes/$SHARE"
LABEL=de.familiebiskup.icloud-photos
HOME_DIR="$HOME/.bh-icloud-photos"; RUNNER="$HOME_DIR/run.sh"; AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"; LOG="$HOME/Library/Logs/bh-icloud-photos.log"

die() { echo "Abbruch: $*" >&2; exit 1; }
mounted() { mount | grep -q " on $MOUNT ("; }

[ "$(uname)" = Darwin ] || die "Dieses Skript läuft nur auf dem Mac."
[ -t 0 ] || die "Bitte direkt im Terminal starten."
command -v brew >/dev/null || die "Homebrew fehlt, siehe https://brew.sh"

read -r -p "Apple-ID (E-Mail): " APPLE_ID
[ -n "$APPLE_ID" ] || die "Apple-ID fehlt."

echo "1/4 Werkzeug installieren"
command -v pipx >/dev/null || brew install pipx
export PATH="$HOME/.local/bin:$PATH"
command -v icloudpd >/dev/null || pipx install icloudpd
ICLOUDPD=$(command -v icloudpd)

echo "2/4 Synology verbinden. Im Fenster mit dem Synology-Konto anmelden und das Passwort im Schlüsselbund sichern."
mounted || open "afp://$NAS/$SHARE"
for _ in $(seq 1 120); do mounted && break; sleep 2; done
mounted || die "Die Synology ist nicht verbunden. Bist du im Heimnetz?"
mkdir -p "$MOUNT/$TARGET" || die "Keine Schreibrechte auf $MOUNT."

echo "3/4 Bei Apple anmelden. Passwort und 2FA-Code hier eingeben, das Speichern im Schlüsselbund bestätigen."
"$ICLOUDPD" --username "$APPLE_ID" --auth-only

echo "4/4 Täglichen Abgleich einrichten"
mkdir -p "$HOME_DIR" "$(dirname "$AGENT")" "$(dirname "$LOG")"
cat >"$RUNNER" <<RUN
#!/usr/bin/env bash
# Started by launchd. A missing mount must never fill the local /Volumes folder.
set -uo pipefail
MOUNT="$MOUNT"
mounted() { mount | grep -q " on \$MOUNT ("; }
mounted || { open "afp://$NAS/$SHARE"; sleep 30; }
mounted || { echo "\$(date) Synology nicht erreichbar, nächster Versuch beim nächsten Lauf"; exit 0; }
# Always the whole library: a shortcut after an interrupted first run would skip all older photos.
/usr/bin/caffeinate -i "$ICLOUDPD" --username "$APPLE_ID" --directory "\$MOUNT/$TARGET" --folder-structure "{:%Y/%Y-%m}" --size original --no-progress-bar
RUN
chmod 700 "$RUNNER"
cat >"$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT"

echo
echo "Fertig. Der erste Abgleich läuft jetzt im Hintergrund und kann viele Stunden dauern."
echo "Fortschritt:  tail -f \"$LOG\""
echo "Ausschalten:  launchctl bootout gui/$(id -u)/$LABEL"
echo "Fragt macOS nach dem Zugriff auf Netzwerk-Volumes, bitte erlauben."
