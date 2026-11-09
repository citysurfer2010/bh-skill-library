'use strict';
/** Legt im Container an, was das Web-Terminal braucht. Dateien des Users werden nie überschrieben, außer den eigenen. */
const fs = require('fs');
const path = require('path');

const HOME = '/home/dev';
const file = (n) => fs.readFileSync(path.join(__dirname, '..', 'container', n), 'utf8');
const TMUX = `set -g status off
set -g mouse on
set -g escape-time 0
set -g history-limit 50000
set -g allow-passthrough on
set -g set-clipboard on
set -g default-terminal "tmux-256color"
set -as terminal-features ",xterm-256color:RGB"
`;
const SHOW = `#!/bin/bash
# Zeigt ein Bild direkt im Web-Terminal: bh-show bild.png
f=$1
[ -r "$f" ] || { echo "Datei nicht lesbar: $f" >&2; exit 1; }
size=$(stat -c%s "$f")
[ "$size" -le 8388608 ] || { echo "Bild zu groß (höchstens 8 MB)" >&2; exit 1; }
name=$(basename "$f" | base64 -w0); data=$(base64 -w0 "$f")
if [ -n "$TMUX" ]; then printf '\\ePtmux;\\e\\e]1337;File=name=%s;size=%s;inline=1:%s\\a\\e\\\\' "$name" "$size" "$data"
else printf '\\e]1337;File=name=%s;size=%s;inline=1:%s\\a' "$name" "$size" "$data"; fi
echo
`;
const CONF = `${HOME}/.config/bh-terminal/tmux.conf`;
const mkdir = (s, p) => new Promise((ok) => s.mkdir(p, () => ok()));
const write = (s, p, data, mode) => new Promise((ok, no) => s.writeFile(p, data, { mode }, (e) => (e ? no(e) : ok())));

async function prepare(sftp) {
  for (const d of ['.config', '.config/bh-terminal', '.config/bh-apps', '.local', '.local/bin', 'uploads']) await mkdir(sftp, `${HOME}/${d}`);
  await write(sftp, CONF, TMUX, 0o644);
  await write(sftp, `${HOME}/.local/bin/bh-show`, SHOW, 0o755);
  await write(sftp, `${HOME}/.local/bin/bh-route`, file('bh-route'), 0o755);
  await write(sftp, `${HOME}/.local/bin/bh-router.mjs`, file('bh-router.mjs'), 0o755);
}
// Geprüft wird der Port: Ein Prozess-Suchmuster fände auch die Shell, die diesen Befehl gerade ausführt.
const START_ROUTER = `( (exec 3<>/dev/tcp/127.0.0.1/8088) 2>/dev/null || exec nohup node ${HOME}/.local/bin/bh-router.mjs ) </dev/null >/tmp/bh-router.log 2>&1 &`;

module.exports = { prepare, HOME, CONF, START_ROUTER };
